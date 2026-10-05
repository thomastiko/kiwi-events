export const state = {
  accessToken: "",
  user: null,

  config: {},

  secretStatuses: {},
  pendingSecretRemovals: new Set(),

  eventUsers: [],
  eventUsersLoaded: false,
  selectedEventUserId: null,

  eventRoles: [],
  eventRolePermissionGroups: [],
  eventRolesLoaded: false,

  mailTemplates: [],
  selectedMailTemplateId: null,
};
