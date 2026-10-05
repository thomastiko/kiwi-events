import { EmailTemplate } from "../mailTemplate.model.js";
import { EmailLog } from "../mailLog.model.js";
import { EMAIL_LOG_STATUS } from "../mail.constants.js";

function applyQueryOptions(query, options = {}) {
  if (options.session) {
    query.session(options.session);
  }

  if (options.select) {
    query.select(options.select);
  }

  if (options.lean !== false) {
    query.lean();
  }

  return query;
}

export async function findEmailTemplateByKey(key, options = {}) {
  const query = EmailTemplate.findOne({ key });
  return applyQueryOptions(query, options);
}

export async function createEmailTemplate(data, options = {}) {
  if (options.session) {
    const [template] = await EmailTemplate.create([data], {
      session: options.session,
    });

    return options.lean ? template.toObject() : template;
  }

  const template = await EmailTemplate.create(data);
  return options.lean ? template.toObject() : template;
}

export async function listEmailTemplates({
  page = 1,
  limit = 20,
  status,
  module,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
} = {}) {
  const query = {};

  if (status) query.status = status;
  if (module) query.module = module;

  if (search?.trim()) {
    query.$or = [
      { key: { $regex: search.trim(), $options: "i" } },
      { name: { $regex: search.trim(), $options: "i" } },
      { module: { $regex: search.trim(), $options: "i" } },
      { category: { $regex: search.trim(), $options: "i" } },
      { subject: { $regex: search.trim(), $options: "i" } },
      { description: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);
  const skip = (numericPage - 1) * numericLimit;

  const sortFieldMap = {
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    key: "key",
    module: "module",
    status: "status",
  };

  const resolvedSortField = sortFieldMap[sortBy] || "createdAt";
  const resolvedSortOrder = sortOrder === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    EmailTemplate.find(query)
      .sort({ [resolvedSortField]: resolvedSortOrder, _id: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
    EmailTemplate.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function findEmailTemplateById(id, options = {}) {
  const query = EmailTemplate.findById(id);
  return applyQueryOptions(query, options);
}

export async function updateEmailTemplateById(id, data, options = {}) {
  const query = EmailTemplate.findByIdAndUpdate(
    id,
    { $set: data },
    {
      new: true,
      runValidators: true,
      session: options.session,
    },
  );

  return applyQueryOptions(query, options);
}

export async function deleteEmailTemplateById(id, options = {}) {
  const query = EmailTemplate.findByIdAndDelete(id);
  return applyQueryOptions(query, options);
}

export async function createEmailLog(data, options = {}) {
  if (options.session) {
    const [log] = await EmailLog.create([data], {
      session: options.session,
    });

    return options.lean ? log.toObject() : log;
  }

  const log = await EmailLog.create(data);
  return options.lean ? log.toObject() : log;
}

export async function updateEmailLogById(id, data, options = {}) {
  const query = EmailLog.findByIdAndUpdate(
    id,
    { $set: data },
    {
      new: true,
      runValidators: true,
      session: options.session,
    },
  );

  return applyQueryOptions(query, options);
}
function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

async function findEmailLogByDeliveryKey(deliveryKey, options = {}) {
  const query = EmailLog.findOne({
    deliveryKey,
  });

  return applyQueryOptions(query, options);
}

export async function claimEmailDelivery(
  { deliveryKey, claimToken, claimExpiresAt, data },
  options = {},
) {
  const now = new Date();

  const reclaimQuery = EmailLog.findOneAndUpdate(
    {
      deliveryKey,
      status: EMAIL_LOG_STATUS.FAILED,
    },
    {
      $set: {
        ...data,

        deliveryKey,
        deliveryClaimToken: claimToken,
        deliveryClaimExpiresAt: claimExpiresAt,

        status: EMAIL_LOG_STATUS.SENDING,
        errorMessage: "",
      },

      $inc: {
        attempts: 1,
      },
    },
    {
      new: true,
      runValidators: true,
      session: options.session,
    },
  );

  const reclaimed = await applyQueryOptions(reclaimQuery, options);

  if (reclaimed) {
    return {
      claimed: true,
      log: reclaimed,
    };
  }
  const unknownQuery = EmailLog.findOneAndUpdate(
    {
      deliveryKey,

      status: EMAIL_LOG_STATUS.SENDING,

      deliveryClaimExpiresAt: {
        $lte: now,
      },
    },
    {
      $set: {
        status: EMAIL_LOG_STATUS.UNKNOWN,

        errorMessage:
          "Delivery outcome is unknown because the previous delivery claim expired.",

        deliveryClaimToken: "",
        deliveryClaimExpiresAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: options.session,
    },
  );

  const unknown = await applyQueryOptions(unknownQuery, options);

  if (unknown) {
    return {
      claimed: false,
      log: unknown,
    };
  }
  try {
    const createData = {
      ...data,

      deliveryKey,
      deliveryClaimToken: claimToken,
      deliveryClaimExpiresAt: claimExpiresAt,

      status: EMAIL_LOG_STATUS.SENDING,
      errorMessage: "",
      attempts: 1,
    };

    let created;

    if (options.session) {
      [created] = await EmailLog.create([createData], {
        session: options.session,
      });
    } else {
      created = await EmailLog.create(createData);
    }

    return {
      claimed: true,
      log: options.lean === false ? created : created.toObject(),
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existing = await findEmailLogByDeliveryKey(deliveryKey, options);

    return {
      claimed: false,
      log: existing,
    };
  }
}
export async function updateClaimedEmailDelivery(
  { emailLogId, claimToken, data = {} },
  options = {},
) {
  const query = EmailLog.findOneAndUpdate(
    {
      _id: emailLogId,
      deliveryClaimToken: claimToken,
    },
    {
      $set: {
        ...data,

        deliveryClaimToken: "",
        deliveryClaimExpiresAt: null,
      },
    },
    {
      new: true,
      runValidators: true,
      session: options.session,
    },
  );

  return applyQueryOptions(query, options);
}
export async function listEmailLogs({
  page = 1,
  limit = 20,
  status,
  templateKey,
  module,
  provider,
  search,
  sortBy = "createdAt",
  sortOrder = "desc",
} = {}) {
  const query = {};

  if (status) query.status = status;
  if (templateKey) query.templateKey = templateKey;
  if (module) query.module = module;
  if (provider) query.provider = provider;

  if (search?.trim()) {
    query.$or = [
      { templateKey: { $regex: search.trim(), $options: "i" } },
      { module: { $regex: search.trim(), $options: "i" } },
      { subjectSnapshot: { $regex: search.trim(), $options: "i" } },
      { "to.email": { $regex: search.trim(), $options: "i" } },
      { "to.name": { $regex: search.trim(), $options: "i" } },
      { errorMessage: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const numericPage = Math.max(1, Number(page) || 1);
  const numericLimit = Math.max(1, Number(limit) || 20);
  const skip = (numericPage - 1) * numericLimit;

  const sortFieldMap = {
    createdAt: "createdAt",
    sentAt: "sentAt",
    templateKey: "templateKey",
    module: "module",
    status: "status",
  };

  const resolvedSortField = sortFieldMap[sortBy] || "createdAt";
  const resolvedSortOrder = sortOrder === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    EmailLog.find(query)
      .sort({ [resolvedSortField]: resolvedSortOrder, _id: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean(),
    EmailLog.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function findEmailLogById(id, options = {}) {
  const query = EmailLog.findById(id);
  return applyQueryOptions(query, options);
}
