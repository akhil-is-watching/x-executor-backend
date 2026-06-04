import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Request } from 'express';
import { JwtUserPayload } from '../decorators/current-user.decorator';
import {
  OrganizationMembership,
  OrganizationMembershipDocument,
} from '../schemas/organization-membership.schema';

@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    @InjectModel(OrganizationMembership.name)
    private readonly membershipModel: Model<OrganizationMembershipDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtUserPayload; orgMembership?: OrganizationMembershipDocument }>();
    const rawOrgId = request.params.orgId;
    const orgId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;
    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      throw new NotFoundException('Organization not found');
    }

    const membership = await this.membershipModel.findOne({
      orgId: new Types.ObjectId(orgId),
      userId: new Types.ObjectId(request.user.sub),
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    request.orgMembership = membership;
    return true;
  }
}
