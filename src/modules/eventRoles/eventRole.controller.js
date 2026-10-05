import {
  createEventRoleService,
  deleteEventRoleService,
  getEventRoleByKeyService,
  listEventRolePermissionGroupsService,
  listEventRolesService,
  updateEventRoleService,
} from "./eventRole.service.js";

export async function listEventRoles(req, res) {
  const roles = await listEventRolesService();

  return res.status(200).json({
    success: true,
    data: roles,
  });
}

export async function getEventRoleByKey(req, res) {
  const { key } = req.validated.params;

  const role = await getEventRoleByKeyService(key);

  return res.status(200).json({
    success: true,
    data: role,
  });
}

export async function getEventRolePermissionGroups(req, res) {
  return res.status(200).json({
    success: true,
    data: listEventRolePermissionGroupsService(),
  });
}

export async function createEventRole(req, res) {
  const role = await createEventRoleService(req.validated.body);

  return res.status(201).json({
    success: true,
    data: role,
  });
}

export async function updateEventRole(req, res) {
  const { key } = req.validated.params;

  const role = await updateEventRoleService(key, req.validated.body);

  return res.status(200).json({
    success: true,
    data: role,
  });
}

export async function deleteEventRole(req, res) {
  const { key } = req.validated.params;

  const result = await deleteEventRoleService(key);

  return res.status(200).json({
    success: true,
    data: result,
  });
}
