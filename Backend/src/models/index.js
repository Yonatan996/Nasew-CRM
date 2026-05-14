import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const withJson = {
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    },
  },
};

const communicationSchema = new Schema(
  {
    channel: String,
    note: String,
    createdAt: String,
    createdBy: String,
  },
  { _id: true },
);

const stageHistorySchema = new Schema(
  {
    stage: String,
    timestamp: String,
    updatedBy: String,
  },
  { _id: true },
);

const userSchema = new Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: String,
    role: { type: String, enum: ['admin', 'manager', 'sales', 'operations'], required: true },
    department: String,
    status: { type: String, default: 'active' },
    passwordHash: { type: String, required: true },
    createdAt: String,
    lastLogin: String,
  },
  withJson,
);

const clientSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, lowercase: true },
    phone: String,
    address: String,
    leadSource: String,
    status: String,
    assignedAgentId: { type: Schema.Types.ObjectId, ref: 'User' },
    preferences: { type: Schema.Types.Mixed, default: {} },
    communicationHistory: { type: [communicationSchema], default: [] },
    followUpDate: String,
    createdAt: String,
    updatedAt: String,
  },
  withJson,
);

const propertySchema = new Schema(
  {
    propertyType: String,
    title: { type: String, required: true },
    description: String,
    location: String,
    size: Number,
    price: Number,
    status: String,
    amenities: { type: [String], default: [] },
    images: { type: [String], default: [] },
    ownerDetails: { type: Schema.Types.Mixed, default: {} },
    updatedAt: String,
  },
  withJson,
);

const pipelineSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    currentStage: String,
    stageHistory: { type: [stageHistorySchema], default: [] },
    probability: Number,
    estimatedValue: Number,
    expectedCloseDate: String,
    agentNotes: String,
    assignedAgentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: String,
    updatedAt: String,
  },
  withJson,
);

const paymentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    transactionType: String,
    amount: Number,
    dueDate: String,
    paymentDate: String,
    status: String,
    paymentMethod: String,
    receiptReference: String,
    evidenceFileName: String,
    evidenceUploadedAt: String,
    validatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: String,
    updatedAt: String,
  },
  withJson,
);

const documentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    documentType: String,
    fileName: String,
    filePath: String,
    fileSize: Number,
    version: Number,
    status: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: String,
    updatedAt: String,
  },
  withJson,
);

const contractSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    pipelineId: { type: Schema.Types.ObjectId, ref: 'Pipeline', default: null },
    title: { type: String, required: true },
    status: { type: String, default: 'Draft' },
    version: { type: Number, default: 1 },
    terms: { type: String, default: '' },
    fileName: String,
    filePath: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt: String,
    updatedAt: String,
    submittedAt: String,
    approvedAt: String,
    finalizedAt: String,
  },
  withJson,
);

const activitySchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activityType: String,
    scheduledDate: String,
    scheduledTime: String,
    duration: Number,
    location: String,
    status: String,
    notes: String,
    createdAt: String,
    updatedAt: String,
  },
  withJson,
);

const approvalSchema = new Schema(
  {
    type: String,
    title: String,
    status: String,
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    relatedEntity: { type: Schema.Types.Mixed, default: null },
    details: String,
    createdAt: String,
    updatedAt: String,
  },
  withJson,
);

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notificationType: String,
    title: String,
    message: String,
    channel: String,
    status: String,
    priority: String,
    relatedEntity: { type: Schema.Types.Mixed, default: null },
    createdAt: String,
  },
  withJson,
);

const auditLogSchema = new Schema(
  {
    userId: String,
    action: String,
    entityType: String,
    entityId: String,
    oldValues: { type: Schema.Types.Mixed, default: null },
    newValues: { type: Schema.Types.Mixed, default: null },
    timestamp: String,
  },
  withJson,
);

const settingSchema = new Schema(
  {
    companyName: String,
    timezone: String,
    reminderLeadDays: Number,
    lowBandwidthMode: Boolean,
  },
  withJson,
);

export const User = models.User || model('User', userSchema);
export const Client = models.Client || model('Client', clientSchema);
export const Property = models.Property || model('Property', propertySchema);
export const Pipeline = models.Pipeline || model('Pipeline', pipelineSchema);
export const Payment = models.Payment || model('Payment', paymentSchema);
export const Document = models.Document || model('Document', documentSchema);
export const Contract = models.Contract || model('Contract', contractSchema);
export const Activity = models.Activity || model('Activity', activitySchema);
export const Approval = models.Approval || model('Approval', approvalSchema);
export const Notification = models.Notification || model('Notification', notificationSchema);
export const AuditLog = models.AuditLog || model('AuditLog', auditLogSchema);
export const Setting = models.Setting || model('Setting', settingSchema);
