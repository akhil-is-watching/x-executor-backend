import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { isOrgAdmin } from '../common/org-role';
import { OrganizationMembershipDocument } from '../schemas/organization-membership.schema';

@Injectable()
export class OrgAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { orgMembership?: OrganizationMembershipDocument }>();
    const membership = request.orgMembership;
    if (!membership || !isOrgAdmin(membership.role)) {
      throw new ForbiddenException('Organization admin access required');
    }
    return true;
  }
}
