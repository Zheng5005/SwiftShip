import { SetMetadata } from '@nestjs/common';
import { AuthRole } from '../../auth/auth.service';
import { ROLES_KEY } from '../../auth/guards';

export const Roles = (...roles: AuthRole[]) => SetMetadata(ROLES_KEY, roles);
