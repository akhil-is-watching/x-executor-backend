import { OrgRole } from '../schemas/organization-membership.schema';

export function isOrgAdmin(role: OrgRole): boolean {
  return role === OrgRole.Owner || role === OrgRole.Admin;
}
