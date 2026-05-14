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
} from '../models/index.js';

const now = () => new Date().toISOString();

export const ensureSeedData = async () => {
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    return;
  }

  const createdAt = now();
  const passwordHash = await argon2.hash('Password123!');

  const [admin, manager, sales, operations] = await User.create([
    {
      fullName: 'System Administrator',
      email: 'admin@nasew.com',
      phone: '+251911000001',
      role: 'admin',
      department: 'IT Support',
      status: 'active',
      passwordHash,
      createdAt,
      lastLogin: null,
    },
    {
      fullName: 'Mekdes Tadesse',
      email: 'manager@nasew.com',
      phone: '+251911000002',
      role: 'manager',
      department: 'Sales & Marketing',
      status: 'active',
      passwordHash,
      createdAt,
      lastLogin: null,
    },
    {
      fullName: 'Samuel Alemu',
      email: 'sales@nasew.com',
      phone: '+251911000003',
      role: 'sales',
      department: 'Sales',
      status: 'active',
      passwordHash,
      createdAt,
      lastLogin: null,
    },
    {
      fullName: 'Rahel Bekele',
      email: 'operations@nasew.com',
      phone: '+251911000004',
      role: 'operations',
      department: 'Operations',
      status: 'active',
      passwordHash,
      createdAt,
      lastLogin: null,
    },
  ]);

  const [propertyOne, propertyTwo] = await Property.create([
    {
      propertyType: 'Apartment',
      title: 'Lake View Residence',
      description: 'A modern apartment close to schools and shopping.',
      location: 'Hawassa',
      size: 145,
      price: 6200000,
      status: 'Available',
      amenities: ['Parking', 'Security', 'Balcony'],
      images: [],
      ownerDetails: { fullName: 'Nasew Holdings' },
      updatedAt: createdAt,
    },
    {
      propertyType: 'Villa',
      title: 'Sunset Family Villa',
      description: 'A spacious villa with a private compound.',
      location: 'Addis Ababa',
      size: 280,
      price: 13500000,
      status: 'Reserved',
      amenities: ['Garden', 'Parking', 'Backup Power'],
      images: [],
      ownerDetails: { fullName: 'Nasew Holdings' },
      updatedAt: createdAt,
    },
  ]);

  const [clientOne, clientTwo] = await Client.create([
    {
      firstName: 'Hanna',
      lastName: 'Tesfaye',
      email: 'hanna.tesfaye@example.com',
      phone: '+251911111111',
      address: 'Hawassa',
      leadSource: 'Website',
      status: 'Qualified',
      assignedAgentId: sales._id,
      preferences: {
        propertyType: 'Apartment',
        location: 'Hawassa',
        budget: 6500000,
      },
      communicationHistory: [
        {
          channel: 'Phone',
          note: 'Requested a two-bedroom apartment near the city center.',
          createdAt,
          createdBy: sales.id,
        },
      ],
      followUpDate: createdAt.slice(0, 10),
      createdAt,
      updatedAt: createdAt,
    },
    {
      firstName: 'Abel',
      lastName: 'Mulugeta',
      email: 'abel.mulugeta@example.com',
      phone: '+251922222222',
      address: 'Addis Ababa',
      leadSource: 'Telegram',
      status: 'Prospect',
      assignedAgentId: sales._id,
      preferences: {
        propertyType: 'Villa',
        location: 'Addis Ababa',
        budget: 12000000,
      },
      communicationHistory: [],
      followUpDate: createdAt.slice(0, 10),
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  await Pipeline.create([
    {
      clientId: clientOne._id,
      propertyId: propertyOne._id,
      currentStage: 'Negotiation',
      stageHistory: [
        { stage: 'Lead', timestamp: createdAt, updatedBy: sales.id },
        { stage: 'Qualified', timestamp: createdAt, updatedBy: sales.id },
        { stage: 'Negotiation', timestamp: createdAt, updatedBy: sales.id },
      ],
      probability: 68,
      estimatedValue: 6200000,
      expectedCloseDate: createdAt.slice(0, 10),
      agentNotes: 'Client requested a revised payment schedule.',
      assignedAgentId: sales._id,
      createdAt,
      updatedAt: createdAt,
    },
    {
      clientId: clientTwo._id,
      propertyId: propertyTwo._id,
      currentStage: 'Reserved',
      stageHistory: [
        { stage: 'Lead', timestamp: createdAt, updatedBy: sales.id },
        { stage: 'Reserved', timestamp: createdAt, updatedBy: sales.id },
      ],
      probability: 82,
      estimatedValue: 13500000,
      expectedCloseDate: createdAt.slice(0, 10),
      agentNotes: 'Waiting for final reservation payment validation.',
      assignedAgentId: sales._id,
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  await Payment.create({
    clientId: clientTwo._id,
    propertyId: propertyTwo._id,
    transactionType: 'Reservation',
    amount: 500000,
    dueDate: createdAt.slice(0, 10),
    paymentDate: null,
    status: 'Pending Validation',
    paymentMethod: 'Bank Transfer',
    receiptReference: 'TRX-458822',
    evidenceFileName: 'reservation-slip-abel.pdf',
    evidenceUploadedAt: createdAt,
    validatedBy: null,
    createdAt,
    updatedAt: createdAt,
  });

  const document = await Document.create({
    clientId: clientOne._id,
    propertyId: propertyOne._id,
    documentType: 'Draft Contract',
    fileName: 'lake-view-draft-contract.pdf',
    filePath: '/documents/lake-view-draft-contract.pdf',
    fileSize: 124000,
    version: 1,
    status: 'Pending Approval',
    uploadedBy: operations._id,
    approvedBy: null,
    createdAt,
    updatedAt: createdAt,
  });

  await Contract.create({
    clientId: clientTwo._id,
    propertyId: propertyTwo._id,
    title: 'Reservation Contract for Sunset Family Villa',
    pipelineId: null,
    status: 'Pending Approval',
    version: 1,
    terms: 'Reservation deposit received. Awaiting managerial approval before final contract issue.',
    fileName: 'sunset-family-villa-reservation-contract.pdf',
    filePath: '/contracts/sunset-family-villa-reservation-contract.pdf',
    createdBy: sales._id,
    submittedBy: sales._id,
    approvedBy: null,
    finalizedBy: null,
    createdAt,
    updatedAt: createdAt,
    submittedAt: createdAt,
    approvedAt: null,
    finalizedAt: null,
  });

  await Activity.create({
    clientId: clientOne._id,
    agentId: sales._id,
    activityType: 'Follow-up Call',
    scheduledDate: createdAt.slice(0, 10),
    scheduledTime: '10:30',
    duration: 30,
    location: 'Remote',
    status: 'Scheduled',
    notes: 'Discuss payment timeline options.',
    createdAt,
    updatedAt: createdAt,
  });

  await Approval.create([
    {
      type: 'Pricing Request',
      title: 'Discount request for Lake View Residence',
      status: 'Pending',
      requestedBy: sales._id,
      reviewedBy: null,
      relatedEntity: { entityType: 'client', entityId: clientOne.id },
      details: 'Client requested a 3% discount after the site visit.',
      createdAt,
      updatedAt: createdAt,
    },
    {
      type: 'Contract Approval',
      title: 'Approve draft contract for Hanna Tesfaye',
      status: 'Pending',
      requestedBy: operations._id,
      reviewedBy: null,
      relatedEntity: { entityType: 'document', entityId: document.id },
      details: 'Draft contract is ready for managerial review.',
      createdAt,
      updatedAt: createdAt,
    },
  ]);

  await Notification.create({
    userId: sales._id,
    notificationType: 'Reminder',
    title: 'Follow up with Hanna Tesfaye',
    message: 'Call the client before noon and update the pipeline stage.',
    channel: 'In-App',
    status: 'Unread',
    priority: 'High',
    relatedEntity: { entityType: 'client', entityId: clientOne.id },
    createdAt,
  });

  await Setting.create({
    companyName: 'Nasew Real Estate',
    timezone: 'Africa/Addis_Ababa',
    reminderLeadDays: 1,
    lowBandwidthMode: true,
  });

  await AuditLog.create({
    userId: admin.id,
    action: 'seed_system',
    entityType: 'system',
    entityId: 'bootstrap',
    oldValues: null,
    newValues: { status: 'initialized' },
    timestamp: createdAt,
  });
};
