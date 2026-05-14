import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import argon2 from 'argon2';
import {
  Activity,
  Approval,
  AuditLog,
  Client,
  Contract,
  Document,
  Notification,
  Payment,
  Pipeline,
  Property,
  Setting,
  User,
} from './models/index.js';
import { authenticate, authorize, createToken, sanitizeUser } from './security/auth.js';

const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173';

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (origin === appOrigin) {
    return true;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
};

const roles = {
  admin: 'admin',
  manager: 'manager',
  sales: 'sales',
  operations: 'operations',
};

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

const stageOrder = ['Lead', 'Qualified', 'Prospect', 'Negotiation', 'Reserved', 'Contract', 'Closed'];
const contractStatuses = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Finalized'];

const isManager = (role) => role === roles.manager;
const isAdmin = (role) => role === roles.admin;
const isSales = (role) => role === roles.sales;
const isOperations = (role) => role === roles.operations;

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const canSeeClient = (client, user) =>
  isAdmin(user.role) ||
  isManager(user.role) ||
  isOperations(user.role) ||
  String(client.assignedAgentId) === String(user.id);

const canEditClient = (client, user) => isAdmin(user.role) || String(client.assignedAgentId) === String(user.id);

const canSeePipeline = (pipeline, user) =>
  isAdmin(user.role) ||
  isManager(user.role) ||
  isOperations(user.role) ||
  String(pipeline.assignedAgentId) === String(user.id);

const canSeeContract = (contract, collections, user) => {
  if (isAdmin(user.role) || isManager(user.role) || isOperations(user.role)) {
    return true;
  }

  const pipeline = collections.pipelines.find((item) => String(item._id) === String(contract.pipelineId));
  return String(pipeline?.assignedAgentId) === String(user.id) || String(contract.createdBy) === String(user.id);
};

const pushAudit = async ({ userId, action, entityType, entityId, oldValues = null, newValues = null }) => {
  await AuditLog.create({
    userId,
    action,
    entityType,
    entityId,
    oldValues,
    newValues,
    timestamp: now(),
  });
};

const getCurrentUser = async (auth) => User.findById(auth.sub);

const upsertNotification = async ({ userId, notificationType, title, message, priority = 'Medium', relatedEntity }) => {
  const existing = await Notification.findOne({
    userId,
    notificationType,
    'relatedEntity.entityType': relatedEntity?.entityType,
    'relatedEntity.entityId': relatedEntity?.entityId,
  });

  if (existing) {
    return existing;
  }

  return Notification.create({
    userId,
    notificationType,
    title,
    message,
    channel: 'In-App',
    status: 'Unread',
    priority,
    relatedEntity,
    createdAt: now(),
  });
};

const ensureReminderNotifications = async () => {
  const settings = await Setting.findOne().lean();
  const reminderLeadDays = Number(settings?.reminderLeadDays ?? 1);
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + reminderLeadDays);
  const deadline = targetDate.toISOString().slice(0, 10);

  const [clients, activities] = await Promise.all([Client.find().lean(), Activity.find().lean()]);

  await Promise.all(
    clients
      .filter((client) => client.followUpDate && client.followUpDate <= deadline && client.assignedAgentId)
      .map((client) =>
        upsertNotification({
          userId: client.assignedAgentId,
          notificationType: 'Follow-Up Reminder',
          title: `Follow up with ${client.firstName} ${client.lastName}`,
          message: `A client follow-up is due on ${client.followUpDate}.`,
          priority: client.followUpDate <= today() ? 'High' : 'Medium',
          relatedEntity: { entityType: 'client', entityId: String(client._id) },
        }),
      ),
  );

  await Promise.all(
    activities
      .filter((activity) => activity.scheduledDate && activity.scheduledDate <= deadline)
      .map((activity) =>
        upsertNotification({
          userId: activity.agentId,
          notificationType: 'Activity Reminder',
          title: activity.activityType || 'Scheduled activity',
          message: `An activity is scheduled for ${activity.scheduledDate} at ${activity.scheduledTime || '09:00'}.`,
          priority: activity.scheduledDate <= today() ? 'High' : 'Medium',
          relatedEntity: { entityType: 'activity', entityId: String(activity._id) },
        }),
      ),
  );
};

const loadCollections = async () => {
  const [clients, pipelines, payments, properties, documents, contracts, activities, approvals, notifications, users, settings] =
    await Promise.all([
      Client.find().lean(),
      Pipeline.find().lean(),
      Payment.find().lean(),
      Property.find().lean(),
      Document.find().lean(),
      Contract.find().lean(),
      Activity.find().lean(),
      Approval.find().lean(),
      Notification.find().lean(),
      User.find().lean(),
      Setting.findOne().lean(),
    ]);

  return {
    clients: normalizeCollection(clients),
    pipelines: normalizeCollection(pipelines),
    payments: normalizeCollection(payments),
    properties: normalizeCollection(properties),
    documents: normalizeCollection(documents),
    contracts: normalizeCollection(contracts),
    activities: normalizeCollection(activities),
    approvals: normalizeCollection(approvals),
    notifications: normalizeCollection(notifications),
    users: normalizeCollection(users),
    settings: normalizeCollection(settings),
  };
};

const filterByRole = (collections, user) => {
  const clients = collections.clients.filter((client) => canSeeClient(client, user));
  const pipelines = collections.pipelines.filter((pipeline) => canSeePipeline(pipeline, user));
  const payments = isSales(user.role)
    ? []
    : collections.payments.filter((payment) => {
        if (isAdmin(user.role) || isManager(user.role) || isOperations(user.role)) {
          return true;
        }

        const pipeline = collections.pipelines.find((item) => String(item.clientId) === String(payment.clientId));
        return String(pipeline?.assignedAgentId) === String(user.id);
      });
  const properties = collections.properties;
  const documents = isSales(user.role)
    ? collections.documents.filter((document) => {
        const pipeline = collections.pipelines.find((item) => String(item.clientId) === String(document.clientId));
        return String(pipeline?.assignedAgentId) === String(user.id);
      })
    : collections.documents;
  const contracts = collections.contracts.filter((contract) => canSeeContract(contract, collections, user));
  const activities = isSales(user.role)
    ? collections.activities.filter((activity) => String(activity.agentId) === String(user.id))
    : collections.activities;
  const approvals =
    isSales(user.role) || isOperations(user.role)
      ? collections.approvals.filter(
          (approval) => String(approval.requestedBy) === String(user.id) || approval.status === 'Pending',
        )
      : collections.approvals;
  const notifications = collections.notifications.filter(
    (notification) => String(notification.userId) === String(user.id),
  );

  return {
    clients,
    pipelines,
    payments,
    properties,
    documents,
    contracts,
    activities,
    approvals,
    notifications,
  };
};

const buildDashboard = (collections, user) => {
  const scoped = filterByRole(collections, user);
  const totalRevenue = scoped.payments
    .filter((payment) => payment.status === 'Validated')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return {
    user: sanitizeUser(user.toObject ? user.toObject() : user),
    metrics: {
      totalClients: scoped.clients.length,
      activeDeals: scoped.pipelines.filter((pipeline) => pipeline.currentStage !== 'Closed').length,
      availableProperties: scoped.properties.filter((property) => property.status === 'Available').length,
      pendingApprovals: scoped.approvals.filter((approval) => approval.status === 'Pending').length,
      pendingPayments: scoped.payments.filter((payment) => payment.status !== 'Validated').length,
      pendingContracts: scoped.contracts.filter((contract) => contract.status === 'Pending Approval').length,
      revenueCollected: totalRevenue,
      scheduledActivities: scoped.activities.filter((activity) => activity.status === 'Scheduled').length,
    },
    spotlight: {
      nextActivities: scoped.activities.slice(0, 5),
      pendingApprovals: scoped.approvals.filter((approval) => approval.status === 'Pending').slice(0, 5),
      pendingContracts: scoped.contracts.filter((contract) => contract.status === 'Pending Approval').slice(0, 5),
      unreadNotifications: scoped.notifications.filter((notification) => notification.status === 'Unread').slice(0, 5),
      pipelineDistribution: stageOrder.map((stage) => ({
        stage,
        count: scoped.pipelines.filter((pipeline) => pipeline.currentStage === stage).length,
      })),
    },
  };
};

const parseMoney = (value) => Number(value || 0);
const normalizeRecord = (record) => {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const { _id, __v, ...rest } = record;
  return {
    ...rest,
    ...(_id ? { id: String(_id) } : {}),
  };
};

const normalizeCollection = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRecord(item));
  }

  return normalizeRecord(value);
};
const asDateOnly = (value) => {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
};

const matchesDateRange = (value, from, to) => {
  const normalized = asDateOnly(value);
  if (!normalized) {
    return false;
  }

  if (from && normalized < from) {
    return false;
  }

  if (to && normalized > to) {
    return false;
  }

  return true;
};

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());

  app.get(
    '/api/health',
    wrap(async (_req, res) => {
      const [users, properties] = await Promise.all([User.countDocuments(), Property.countDocuments()]);
      res.json({
        status: 'ok',
        generatedAt: now(),
        users,
        properties,
        database: 'mongodb',
      });
    }),
  );

  app.post(
    '/api/auth/login',
    wrap(async (req, res) => {
      const { email, password } = req.body || {};
      const user = await User.findOne({ email: String(email || '').toLowerCase() });

      if (!user || user.status !== 'active') {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const isValid = await argon2.verify(user.passwordHash, String(password || ''));
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      user.lastLogin = now();
      await user.save();

      await pushAudit({
        userId: user.id,
        action: 'login',
        entityType: 'user',
        entityId: user.id,
        newValues: { email: user.email },
      });

      return res.json({
        token: createToken(user),
        user: sanitizeUser(user.toObject()),
        demoPassword: 'Password123!',
      });
    }),
  );

  app.use('/api', authenticate);

  app.get(
    '/api/me',
    wrap(async (req, res) => {
      const user = await getCurrentUser(req.auth);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      return res.json({ user: sanitizeUser(user.toObject()) });
    }),
  );

  app.get(
    '/api/dashboard',
    wrap(async (req, res) => {
      await ensureReminderNotifications();
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      return res.json(buildDashboard(collections, user));
    }),
  );

  app.get(
    '/api/bootstrap',
    wrap(async (req, res) => {
      await ensureReminderNotifications();
      const [user, collections, audits] = await Promise.all([
        getCurrentUser(req.auth),
        loadCollections(),
        AuditLog.find().sort({ timestamp: -1 }).limit(25).lean(),
      ]);

      return res.json({
        ...filterByRole(collections, user),
        dashboard: buildDashboard(collections, user),
        users:
          isAdmin(user.role) || isManager(user.role)
            ? collections.users.map((item) => sanitizeUser(item))
            : [],
        audits: isAdmin(user.role) ? audits : [],
        settings: isAdmin(user.role) ? collections.settings : null,
        roles,
      });
    }),
  );

  app.get(
    '/api/clients',
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).clients);
    }),
  );

  app.post(
    '/api/clients',
    authorize(roles.sales, roles.admin),
    wrap(async (req, res) => {
      const payload = req.body || {};
      const createdAt = now();
      const client = await Client.create({
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: String(payload.email || '').toLowerCase(),
        phone: payload.phone,
        address: payload.address || '',
        leadSource: payload.leadSource || 'Manual Entry',
        status: payload.status || 'Lead',
        assignedAgentId: payload.assignedAgentId || req.auth.sub,
        preferences: payload.preferences || {},
        communicationHistory: [],
        followUpDate: payload.followUpDate || createdAt.slice(0, 10),
        createdAt,
        updatedAt: createdAt,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_client',
        entityType: 'client',
        entityId: client.id,
        newValues: client.toObject(),
      });

      res.status(201).json(client);
    }),
  );

  app.patch(
    '/api/clients/:id',
    wrap(async (req, res) => {
      const [user, client] = await Promise.all([getCurrentUser(req.auth), Client.findById(req.params.id)]);

      if (!client) {
        return res.status(404).json({ message: 'Client not found.' });
      }

      if (!canEditClient(client, user)) {
        return res.status(403).json({ message: 'You cannot edit this client.' });
      }

      const oldValues = client.toObject();
      Object.assign(client, req.body, { updatedAt: now() });
      await client.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_client',
        entityType: 'client',
        entityId: client.id,
        oldValues,
        newValues: client.toObject(),
      });

      res.json(client);
    }),
  );

  app.post(
    '/api/clients/:id/communications',
    authorize(roles.sales, roles.manager, roles.admin),
    wrap(async (req, res) => {
      const [user, client] = await Promise.all([getCurrentUser(req.auth), Client.findById(req.params.id)]);

      if (!client) {
        return res.status(404).json({ message: 'Client not found.' });
      }

      if (!canSeeClient(client, user)) {
        return res.status(403).json({ message: 'You cannot log communication for this client.' });
      }

      const communication = {
        channel: req.body.channel || 'Phone',
        note: req.body.note || '',
        createdAt: now(),
        createdBy: req.auth.sub,
      };

      const oldValues = client.toObject();
      client.communicationHistory.push(communication);
      if (req.body.followUpDate) {
        client.followUpDate = req.body.followUpDate;
      }
      client.updatedAt = now();
      await client.save();

      if (client.followUpDate && client.assignedAgentId) {
        await upsertNotification({
          userId: client.assignedAgentId,
          notificationType: 'Follow-Up Reminder',
          title: `Follow up with ${client.firstName} ${client.lastName}`,
          message: `A client follow-up is due on ${client.followUpDate}.`,
          priority: client.followUpDate <= today() ? 'High' : 'Medium',
          relatedEntity: { entityType: 'client', entityId: client.id },
        });
      }

      await pushAudit({
        userId: req.auth.sub,
        action: 'log_client_communication',
        entityType: 'client',
        entityId: client.id,
        oldValues,
        newValues: client.toObject(),
      });

      res.status(201).json(client);
    }),
  );

  app.get(
    '/api/properties',
    wrap(async (_req, res) => {
      res.json(await Property.find().lean());
    }),
  );

  app.post(
    '/api/properties',
    authorize(roles.operations, roles.admin),
    wrap(async (req, res) => {
      const property = await Property.create({
        propertyType: req.body.propertyType,
        title: req.body.title,
        description: req.body.description || '',
        location: req.body.location,
        size: Number(req.body.size || 0),
        price: parseMoney(req.body.price),
        status: req.body.status || 'Available',
        amenities: req.body.amenities || [],
        images: [],
        ownerDetails: req.body.ownerDetails || {},
        updatedAt: now(),
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_property',
        entityType: 'property',
        entityId: property.id,
        newValues: property.toObject(),
      });

      res.status(201).json(property);
    }),
  );

  app.patch(
    '/api/properties/:id',
    authorize(roles.operations, roles.admin),
    wrap(async (req, res) => {
      const property = await Property.findById(req.params.id);
      if (!property) {
        return res.status(404).json({ message: 'Property not found.' });
      }

      const oldValues = property.toObject();
      Object.assign(property, req.body, { updatedAt: now() });
      await property.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_property',
        entityType: 'property',
        entityId: property.id,
        oldValues,
        newValues: property.toObject(),
      });

      res.json(property);
    }),
  );

  app.post(
    '/api/properties/:id/reserve',
    authorize(roles.sales, roles.admin),
    wrap(async (req, res) => {
      const property = await Property.findById(req.params.id);
      if (!property) {
        return res.status(404).json({ message: 'Property not found.' });
      }

      if (property.status !== 'Available') {
        return res.status(409).json({ message: 'This property is not available for reservation.' });
      }

      const client = await Client.findById(req.body.clientId);
      if (!client) {
        return res.status(404).json({ message: 'Client not found.' });
      }

      const createdAt = now();
      let pipeline = await Pipeline.findOne({ clientId: client._id, propertyId: property._id });
      if (!pipeline) {
        pipeline = await Pipeline.create({
          clientId: client._id,
          propertyId: property._id,
          currentStage: 'Reserved',
          stageHistory: [{ stage: 'Reserved', timestamp: createdAt, updatedBy: req.auth.sub }],
          probability: Number(req.body.probability || 70),
          estimatedValue: parseMoney(req.body.estimatedValue || property.price),
          expectedCloseDate: req.body.expectedCloseDate || createdAt.slice(0, 10),
          agentNotes: req.body.agentNotes || 'Property reserved through the CRM.',
          assignedAgentId: client.assignedAgentId || req.auth.sub,
          createdAt,
          updatedAt: createdAt,
        });
      } else {
        const oldPipeline = pipeline.toObject();
        pipeline.currentStage = 'Reserved';
        pipeline.updatedAt = createdAt;
        pipeline.stageHistory.unshift({ stage: 'Reserved', timestamp: createdAt, updatedBy: req.auth.sub });
        await pipeline.save();
        await pushAudit({
          userId: req.auth.sub,
          action: 'reserve_property_pipeline_update',
          entityType: 'pipeline',
          entityId: pipeline.id,
          oldValues: oldPipeline,
          newValues: pipeline.toObject(),
        });
      }

      const oldProperty = property.toObject();
      property.status = 'Reserved';
      property.updatedAt = createdAt;
      await property.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'reserve_property',
        entityType: 'property',
        entityId: property.id,
        oldValues: oldProperty,
        newValues: property.toObject(),
      });

      res.json({ property, pipeline });
    }),
  );

  app.get(
    '/api/pipelines',
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).pipelines);
    }),
  );

  app.post(
    '/api/pipelines',
    authorize(roles.sales, roles.admin),
    wrap(async (req, res) => {
      const createdAt = now();
      const property = await Property.findById(req.body.propertyId);
      if (!property) {
        return res.status(404).json({ message: 'Property not found.' });
      }

      if (['Reserved', 'Booked', 'Sold'].includes(property.status) && req.body.currentStage === 'Reserved') {
        return res.status(409).json({ message: 'This property is already reserved or sold.' });
      }

      const pipeline = await Pipeline.create({
        clientId: req.body.clientId,
        propertyId: req.body.propertyId,
        currentStage: req.body.currentStage || 'Lead',
        stageHistory: [
          {
            stage: req.body.currentStage || 'Lead',
            timestamp: createdAt,
            updatedBy: req.auth.sub,
          },
        ],
        probability: Number(req.body.probability || 15),
        estimatedValue: parseMoney(req.body.estimatedValue),
        expectedCloseDate: req.body.expectedCloseDate || createdAt.slice(0, 10),
        agentNotes: req.body.agentNotes || '',
        assignedAgentId: req.body.assignedAgentId || req.auth.sub,
        createdAt,
        updatedAt: createdAt,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_pipeline',
        entityType: 'pipeline',
        entityId: pipeline.id,
        newValues: pipeline.toObject(),
      });

      res.status(201).json(pipeline);
    }),
  );

  app.patch(
    '/api/pipelines/:id',
    authorize(roles.sales, roles.manager, roles.admin),
    wrap(async (req, res) => {
      const [user, pipeline] = await Promise.all([getCurrentUser(req.auth), Pipeline.findById(req.params.id)]);

      if (!pipeline) {
        return res.status(404).json({ message: 'Pipeline not found.' });
      }

      if (isSales(user.role) && String(pipeline.assignedAgentId) !== String(user.id)) {
        return res.status(403).json({ message: 'You cannot update this pipeline.' });
      }

      const oldValues = pipeline.toObject();
      const property = await Property.findById(pipeline.propertyId);
      if (!property) {
        return res.status(404).json({ message: 'Linked property not found.' });
      }

      if (req.body.currentStage === 'Reserved' && property.status !== 'Available' && property.status !== 'Reserved') {
        return res.status(409).json({ message: 'Only available properties can move to Reserved.' });
      }

      Object.assign(pipeline, req.body, { updatedAt: now() });
      if (req.body.currentStage && req.body.currentStage !== oldValues.currentStage) {
        pipeline.stageHistory.unshift({
          stage: req.body.currentStage,
          timestamp: now(),
          updatedBy: req.auth.sub,
        });
      }
      await pipeline.save();

      if (req.body.currentStage === 'Reserved') {
        property.status = 'Reserved';
        property.updatedAt = now();
        await property.save();
      }
      if (req.body.currentStage === 'Contract') {
        property.status = 'Booked';
        property.updatedAt = now();
        await property.save();
      }
      if (req.body.currentStage === 'Closed') {
        property.status = 'Sold';
        property.updatedAt = now();
        await property.save();
      }

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_pipeline',
        entityType: 'pipeline',
        entityId: pipeline.id,
        oldValues,
        newValues: pipeline.toObject(),
      });

      res.json(pipeline);
    }),
  );

  app.get(
    '/api/payments',
    authorize(roles.operations, roles.manager, roles.admin),
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).payments);
    }),
  );

  app.post(
    '/api/payments',
    authorize(roles.operations, roles.admin),
    wrap(async (req, res) => {
      const createdAt = now();
      const payment = await Payment.create({
        clientId: req.body.clientId,
        propertyId: req.body.propertyId,
        transactionType: req.body.transactionType || 'Reservation',
        amount: parseMoney(req.body.amount),
        dueDate: req.body.dueDate || createdAt.slice(0, 10),
        paymentDate: req.body.paymentDate || null,
        status: req.body.status || 'Pending Validation',
        paymentMethod: req.body.paymentMethod || 'Bank Transfer',
        receiptReference: req.body.receiptReference || '',
        evidenceFileName: req.body.evidenceFileName || '',
        evidenceUploadedAt: req.body.evidenceFileName ? createdAt : null,
        validatedBy: req.body.validatedBy || null,
        createdAt,
        updatedAt: createdAt,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_payment',
        entityType: 'payment',
        entityId: payment.id,
        newValues: payment.toObject(),
      });

      res.status(201).json(payment);
    }),
  );

  app.patch(
    '/api/payments/:id',
    authorize(roles.operations, roles.admin),
    wrap(async (req, res) => {
      const payment = await Payment.findById(req.params.id);
      if (!payment) {
        return res.status(404).json({ message: 'Payment not found.' });
      }

      const oldValues = payment.toObject();
      Object.assign(payment, req.body, { updatedAt: now() });
      if (payment.status === 'Validated') {
        payment.validatedBy = req.auth.sub;
        payment.paymentDate = payment.paymentDate || now().slice(0, 10);
      }
      await payment.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_payment',
        entityType: 'payment',
        entityId: payment.id,
        oldValues,
        newValues: payment.toObject(),
      });

      res.json(payment);
    }),
  );

  app.get(
    '/api/documents',
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).documents);
    }),
  );

  app.post(
    '/api/documents',
    authorize(roles.operations, roles.admin),
    wrap(async (req, res) => {
      const createdAt = now();
      const document = await Document.create({
        clientId: req.body.clientId,
        propertyId: req.body.propertyId,
        documentType: req.body.documentType,
        fileName: req.body.fileName,
        filePath: req.body.filePath || `/documents/${req.body.fileName || 'document.pdf'}`,
        fileSize: Number(req.body.fileSize || 0),
        version: Number(req.body.version || 1),
        status: req.body.status || 'Pending Approval',
        uploadedBy: req.auth.sub,
        approvedBy: null,
        createdAt,
        updatedAt: createdAt,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_document',
        entityType: 'document',
        entityId: document.id,
        newValues: document.toObject(),
      });

      res.status(201).json(document);
    }),
  );

  app.patch(
    '/api/documents/:id',
    authorize(roles.operations, roles.manager, roles.admin),
    wrap(async (req, res) => {
      const document = await Document.findById(req.params.id);
      if (!document) {
        return res.status(404).json({ message: 'Document not found.' });
      }

      const oldValues = document.toObject();
      Object.assign(document, req.body, { updatedAt: now() });
      if (document.status === 'Approved') {
        document.approvedBy = req.auth.sub;
      }
      await document.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_document',
        entityType: 'document',
        entityId: document.id,
        oldValues,
        newValues: document.toObject(),
      });

      res.json(document);
    }),
  );

  app.get(
    '/api/contracts',
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).contracts);
    }),
  );

  app.post(
    '/api/contracts',
    authorize(roles.sales, roles.operations, roles.admin),
    wrap(async (req, res) => {
      const [client, property] = await Promise.all([
        Client.findById(req.body.clientId),
        Property.findById(req.body.propertyId),
      ]);

      if (!client) {
        return res.status(404).json({ message: 'Client not found.' });
      }

      if (!property) {
        return res.status(404).json({ message: 'Property not found.' });
      }

      if (!['Reserved', 'Booked', 'Sold'].includes(property.status)) {
        return res.status(400).json({ message: 'A property must be reserved before a contract can be generated.' });
      }

      const pipeline = await Pipeline.findOne({ clientId: client._id, propertyId: property._id });
      const createdAt = now();
      const contract = await Contract.create({
        clientId: client._id,
        propertyId: property._id,
        pipelineId: pipeline?._id || null,
        title: req.body.title || `Contract for ${property.title}`,
        status: req.body.status || 'Draft',
        version: Number(req.body.version || 1),
        terms: req.body.terms || '',
        fileName: req.body.fileName || `contract-${property._id}.pdf`,
        filePath: req.body.filePath || `/contracts/contract-${property._id}.pdf`,
        createdBy: req.auth.sub,
        submittedBy: req.body.status === 'Pending Approval' ? req.auth.sub : null,
        approvedBy: null,
        finalizedBy: null,
        createdAt,
        updatedAt: createdAt,
        submittedAt: req.body.status === 'Pending Approval' ? createdAt : null,
        approvedAt: null,
        finalizedAt: null,
      });

      if (contract.status === 'Pending Approval') {
        await Approval.create({
          type: 'Contract Approval',
          title: contract.title,
          status: 'Pending',
          requestedBy: req.auth.sub,
          reviewedBy: null,
          relatedEntity: { entityType: 'contract', entityId: contract.id },
          details: req.body.terms || 'Contract submitted for managerial approval.',
          createdAt,
          updatedAt: createdAt,
        });
      }

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_contract',
        entityType: 'contract',
        entityId: contract.id,
        newValues: contract.toObject(),
      });

      res.status(201).json(contract);
    }),
  );

  app.patch(
    '/api/contracts/:id',
    authorize(roles.sales, roles.operations, roles.manager, roles.admin),
    wrap(async (req, res) => {
      const contract = await Contract.findById(req.params.id);
      if (!contract) {
        return res.status(404).json({ message: 'Contract not found.' });
      }

      const nextStatus = req.body.status;
      if (nextStatus && !contractStatuses.includes(nextStatus)) {
        return res.status(400).json({ message: 'Invalid contract status supplied.' });
      }

      if (nextStatus === 'Approved' || nextStatus === 'Rejected') {
        if (!isManager(req.auth.role) && !isAdmin(req.auth.role)) {
          return res.status(403).json({ message: 'Only managers and admins can approve contracts.' });
        }
      }

      if (nextStatus === 'Finalized' && !isOperations(req.auth.role) && !isAdmin(req.auth.role)) {
        return res.status(403).json({ message: 'Only operations and admins can finalize contracts.' });
      }

      const oldValues = contract.toObject();
      Object.assign(contract, req.body, { updatedAt: now() });

      if (nextStatus === 'Pending Approval' && oldValues.status !== 'Pending Approval') {
        contract.submittedBy = req.auth.sub;
        contract.submittedAt = now();
        await Approval.create({
          type: 'Contract Approval',
          title: contract.title,
          status: 'Pending',
          requestedBy: req.auth.sub,
          reviewedBy: null,
          relatedEntity: { entityType: 'contract', entityId: contract.id },
          details: contract.terms || 'Contract submitted for managerial approval.',
          createdAt: now(),
          updatedAt: now(),
        });
      }

      if (nextStatus === 'Approved') {
        contract.approvedBy = req.auth.sub;
        contract.approvedAt = now();
        const pipeline = contract.pipelineId ? await Pipeline.findById(contract.pipelineId) : null;
        if (pipeline) {
          pipeline.currentStage = 'Contract';
          pipeline.updatedAt = now();
          pipeline.stageHistory.unshift({ stage: 'Contract', timestamp: now(), updatedBy: req.auth.sub });
          await pipeline.save();
        }

        await Approval.updateMany(
          {
            'relatedEntity.entityType': 'contract',
            'relatedEntity.entityId': contract.id,
            status: 'Pending',
          },
          { $set: { status: 'Approved', reviewedBy: req.auth.sub, updatedAt: now() } },
        );
      }

      if (nextStatus === 'Rejected') {
        await Approval.updateMany(
          {
            'relatedEntity.entityType': 'contract',
            'relatedEntity.entityId': contract.id,
            status: 'Pending',
          },
          { $set: { status: 'Rejected', reviewedBy: req.auth.sub, updatedAt: now() } },
        );
      }

      if (nextStatus === 'Finalized') {
        if (oldValues.status !== 'Approved' && oldValues.status !== 'Finalized') {
          return res.status(400).json({ message: 'Only approved contracts can be finalized.' });
        }

        contract.finalizedBy = req.auth.sub;
        contract.finalizedAt = now();
        const [property, pipeline] = await Promise.all([
          Property.findById(contract.propertyId),
          contract.pipelineId ? Pipeline.findById(contract.pipelineId) : null,
        ]);

        if (property) {
          property.status = 'Sold';
          property.updatedAt = now();
          await property.save();
        }

        if (pipeline) {
          pipeline.currentStage = 'Closed';
          pipeline.updatedAt = now();
          pipeline.stageHistory.unshift({ stage: 'Closed', timestamp: now(), updatedBy: req.auth.sub });
          await pipeline.save();
        }
      }

      await contract.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_contract',
        entityType: 'contract',
        entityId: contract.id,
        oldValues,
        newValues: contract.toObject(),
      });

      res.json(contract);
    }),
  );

  app.get(
    '/api/activities',
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).activities);
    }),
  );

  app.post(
    '/api/activities',
    authorize(roles.sales, roles.admin),
    wrap(async (req, res) => {
      const createdAt = now();
      const activity = await Activity.create({
        clientId: req.body.clientId,
        agentId: req.body.agentId || req.auth.sub,
        activityType: req.body.activityType,
        scheduledDate: req.body.scheduledDate || createdAt.slice(0, 10),
        scheduledTime: req.body.scheduledTime || '09:00',
        duration: Number(req.body.duration || 30),
        location: req.body.location || 'Remote',
        status: req.body.status || 'Scheduled',
        notes: req.body.notes || '',
        createdAt,
        updatedAt: createdAt,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_activity',
        entityType: 'activity',
        entityId: activity.id,
        newValues: activity.toObject(),
      });

      res.status(201).json(activity);
    }),
  );

  app.get(
    '/api/approvals',
    wrap(async (req, res) => {
      const [user, collections] = await Promise.all([getCurrentUser(req.auth), loadCollections()]);
      res.json(filterByRole(collections, user).approvals);
    }),
  );

  app.post(
    '/api/approvals',
    authorize(roles.sales, roles.operations, roles.admin),
    wrap(async (req, res) => {
      const createdAt = now();
      const approval = await Approval.create({
        type: req.body.type,
        title: req.body.title,
        status: 'Pending',
        requestedBy: req.auth.sub,
        reviewedBy: null,
        relatedEntity: req.body.relatedEntity || null,
        details: req.body.details || '',
        createdAt,
        updatedAt: createdAt,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_approval',
        entityType: 'approval',
        entityId: approval.id,
        newValues: approval.toObject(),
      });

      res.status(201).json(approval);
    }),
  );

  app.patch(
    '/api/approvals/:id',
    authorize(roles.manager, roles.admin),
    wrap(async (req, res) => {
      const approval = await Approval.findById(req.params.id);
      if (!approval) {
        return res.status(404).json({ message: 'Approval request not found.' });
      }

      const oldValues = approval.toObject();
      Object.assign(approval, req.body, { updatedAt: now(), reviewedBy: req.auth.sub });
      await approval.save();

      if (approval.relatedEntity?.entityType === 'contract' && approval.relatedEntity?.entityId) {
        const contract = await Contract.findById(approval.relatedEntity.entityId);
        if (contract) {
          if (approval.status === 'Approved') {
            contract.status = 'Approved';
            contract.approvedBy = req.auth.sub;
            contract.approvedAt = now();
          }

          if (approval.status === 'Rejected') {
            contract.status = 'Rejected';
          }

          contract.updatedAt = now();
          await contract.save();
        }
      }

      await pushAudit({
        userId: req.auth.sub,
        action: 'review_approval',
        entityType: 'approval',
        entityId: approval.id,
        oldValues,
        newValues: approval.toObject(),
      });

      res.json(approval);
    }),
  );

  app.get(
    '/api/notifications',
    wrap(async (req, res) => {
      res.json(await Notification.find({ userId: req.auth.sub }).lean());
    }),
  );

  app.patch(
    '/api/notifications/:id',
    wrap(async (req, res) => {
      const notification = await Notification.findOne({ _id: req.params.id, userId: req.auth.sub });
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found.' });
      }

      Object.assign(notification, req.body);
      await notification.save();
      res.json(notification);
    }),
  );

  app.get(
    '/api/reports/summary',
    authorize(roles.manager, roles.admin),
    wrap(async (req, res) => {
      const [pipelines, payments, users, properties, clients, contracts, activities, approvals] = await Promise.all([
        Pipeline.find().lean(),
        Payment.find().lean(),
        User.find().lean(),
        Property.find().lean(),
        Client.find().lean(),
        Contract.find().lean(),
        Activity.find().lean(),
        Approval.find().lean(),
      ]);
      const from = req.query.from ? String(req.query.from) : '';
      const to = req.query.to ? String(req.query.to) : '';
      const agentId = req.query.agentId ? String(req.query.agentId) : '';
      const dateFilteredPipelines = pipelines.filter((pipeline) =>
        from || to ? matchesDateRange(pipeline.updatedAt || pipeline.createdAt, from, to) : true,
      );
      const agentFilteredPipelines = agentId
        ? dateFilteredPipelines.filter((pipeline) => String(pipeline.assignedAgentId) === agentId)
        : dateFilteredPipelines;
      const filteredClients = clients.filter((client) => {
        const matchesAgent = !agentId || String(client.assignedAgentId) === agentId;
        const matchesDate = from || to ? matchesDateRange(client.createdAt || client.followUpDate, from, to) : true;
        return matchesAgent && matchesDate;
      });
      const filteredActivities = activities.filter((activity) => {
        const matchesAgent = !agentId || String(activity.agentId) === agentId;
        const matchesDate = from || to ? matchesDateRange(activity.scheduledDate || activity.createdAt, from, to) : true;
        return matchesAgent && matchesDate;
      });
      const filteredPayments = payments.filter((payment) => {
        const linkedPipeline = pipelines.find((pipeline) => String(pipeline.clientId) === String(payment.clientId));
        const matchesAgent = !agentId || String(linkedPipeline?.assignedAgentId) === agentId;
        const matchesDate = from || to ? matchesDateRange(payment.paymentDate || payment.createdAt, from, to) : true;
        return matchesAgent && matchesDate;
      });
      const filteredContracts = contracts.filter((contract) => {
        const linkedPipeline = pipelines.find((pipeline) => String(pipeline._id) === String(contract.pipelineId));
        const matchesAgent =
          !agentId ||
          String(linkedPipeline?.assignedAgentId) === agentId ||
          String(contract.createdBy) === agentId;
        const matchesDate = from || to ? matchesDateRange(contract.updatedAt || contract.createdAt, from, to) : true;
        return matchesAgent && matchesDate;
      });
      const filteredApprovals = approvals.filter((approval) =>
        from || to ? matchesDateRange(approval.updatedAt || approval.createdAt, from, to) : true,
      );
      const filteredProperties = properties.filter((property) =>
        from || to ? matchesDateRange(property.updatedAt, from, to) : true,
      );

      const totalPipelineValue = agentFilteredPipelines.reduce((sum, pipeline) => sum + Number(pipeline.estimatedValue || 0), 0);
      const validatedPayments = filteredPayments
        .filter((payment) => payment.status === 'Validated')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const salesAgents = users.filter((user) => user.role === roles.sales && user.status === 'active');
      const todayDate = today();
      const agentPerformance = salesAgents.map((agent) => {
        const ownedPipelines = agentFilteredPipelines.filter((pipeline) => String(pipeline.assignedAgentId) === String(agent._id));
        const ownedClients = filteredClients.filter((client) => String(client.assignedAgentId) === String(agent._id));
        const ownedActivities = filteredActivities.filter((activity) => String(activity.agentId) === String(agent._id));
        const ownedPayments = filteredPayments.filter((payment) =>
          ownedPipelines.some((pipeline) => String(pipeline.clientId) === String(payment.clientId)),
        );

        return {
          agentId: String(agent._id),
          fullName: agent.fullName,
          totalClients: ownedClients.length,
          activeDeals: ownedPipelines.filter((pipeline) => pipeline.currentStage !== 'Closed').length,
          closedDeals: ownedPipelines.filter((pipeline) => pipeline.currentStage === 'Closed').length,
          reservedDeals: ownedPipelines.filter((pipeline) => pipeline.currentStage === 'Reserved').length,
          scheduledActivities: ownedActivities.filter((activity) => activity.status === 'Scheduled').length,
          overdueFollowUps: ownedClients.filter((client) => client.followUpDate && client.followUpDate < todayDate).length,
          validatedRevenue: ownedPayments
            .filter((payment) => payment.status === 'Validated')
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        };
      });

      res.json({
        salesForecast: totalPipelineValue,
        validatedPayments,
        activeAgents: salesAgents.length,
        propertyStatusBreakdown: ['Available', 'Reserved', 'Booked', 'Sold'].map((status) => ({
          status,
          count: filteredProperties.filter((property) => property.status === status).length,
        })),
        pipelineStageBreakdown: stageOrder.map((stage) => ({
          stage,
          count: agentFilteredPipelines.filter((pipeline) => pipeline.currentStage === stage).length,
        })),
        contractStatusBreakdown: contractStatuses.map((status) => ({
          status,
          count: filteredContracts.filter((contract) => contract.status === status).length,
        })),
        paymentStatusBreakdown: ['Pending Validation', 'Validated'].map((status) => ({
          status,
          count: filteredPayments.filter((payment) => payment.status === status).length,
          totalAmount: filteredPayments
            .filter((payment) => payment.status === status)
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
        })),
        leadSourceBreakdown: Array.from(
          filteredClients.reduce((acc, client) => {
            acc.set(client.leadSource, (acc.get(client.leadSource) || 0) + 1);
            return acc;
          }, new Map()),
        ).map(([source, count]) => ({ source, count })),
        approvalQueue: {
          pending: filteredApprovals.filter((approval) => approval.status === 'Pending').length,
          approved: filteredApprovals.filter((approval) => approval.status === 'Approved').length,
          rejected: filteredApprovals.filter((approval) => approval.status === 'Rejected').length,
        },
        followUpSummary: {
          overdue: filteredClients.filter((client) => client.followUpDate && client.followUpDate < todayDate).length,
          dueToday: filteredClients.filter((client) => client.followUpDate === todayDate).length,
          upcoming: filteredClients.filter((client) => client.followUpDate && client.followUpDate > todayDate).length,
        },
        agentPerformance,
        filters: {
          from,
          to,
          agentId,
        },
        generatedAt: now(),
      });
    }),
  );

  app.get(
    '/api/users',
    authorize(roles.admin, roles.manager),
    wrap(async (_req, res) => {
      const users = await User.find().lean();
      res.json(users.map((user) => sanitizeUser(user)));
    }),
  );

  app.post(
    '/api/users',
    authorize(roles.admin),
    wrap(async (req, res) => {
      const createdAt = now();
      const user = await User.create({
        fullName: req.body.fullName,
        email: String(req.body.email || '').toLowerCase(),
        phone: req.body.phone || '',
        role: req.body.role,
        department: req.body.department || '',
        status: req.body.status || 'active',
        passwordHash: await argon2.hash(req.body.password || 'Password123!'),
        createdAt,
        lastLogin: null,
      });

      await pushAudit({
        userId: req.auth.sub,
        action: 'create_user',
        entityType: 'user',
        entityId: user.id,
        newValues: sanitizeUser(user.toObject()),
      });

      res.status(201).json(sanitizeUser(user.toObject()));
    }),
  );

  app.patch(
    '/api/users/:id',
    authorize(roles.admin),
    wrap(async (req, res) => {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const oldValues = sanitizeUser(user.toObject());
      Object.assign(user, req.body);
      if (req.body.password) {
        user.passwordHash = await argon2.hash(req.body.password);
      }
      if (req.body.email) {
        user.email = String(req.body.email).toLowerCase();
      }
      await user.save();

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_user',
        entityType: 'user',
        entityId: user.id,
        oldValues,
        newValues: sanitizeUser(user.toObject()),
      });

      res.json(sanitizeUser(user.toObject()));
    }),
  );

  app.delete(
    '/api/users/:id',
    authorize(roles.admin),
    wrap(async (req, res) => {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const oldValues = sanitizeUser(user.toObject());
      await user.deleteOne();

      await pushAudit({
        userId: req.auth.sub,
        action: 'delete_user',
        entityType: 'user',
        entityId: req.params.id,
        oldValues,
        newValues: null,
      });

      res.status(204).end();
    }),
  );

  app.get(
    '/api/audits',
    authorize(roles.admin),
    wrap(async (_req, res) => {
      res.json(await AuditLog.find().sort({ timestamp: -1 }).limit(100).lean());
    }),
  );

  app.get(
    '/api/settings',
    authorize(roles.admin),
    wrap(async (_req, res) => {
      res.json(await Setting.findOne().lean());
    }),
  );

  app.patch(
    '/api/settings',
    authorize(roles.admin),
    wrap(async (req, res) => {
      const settings = await Setting.findOneAndUpdate({}, { $set: req.body }, { new: true, upsert: true });

      await pushAudit({
        userId: req.auth.sub,
        action: 'update_settings',
        entityType: 'settings',
        entityId: String(settings._id),
        newValues: settings.toObject(),
      });

      res.json(settings);
    }),
  );

  app.use((error, _req, res, _next) => {
    console.error(error);

    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }

    if (error?.code === 11000) {
      return res.status(409).json({ message: 'A record with that unique value already exists.' });
    }

    return res.status(500).json({ message: 'Unexpected server error.' });
  });

  return app;
};
