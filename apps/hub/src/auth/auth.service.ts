import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse } from './auth.types';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userModel.findOne({ email }).select('_id').lean();
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.userModel.create({
      email,
      passwordHash,
      orgId: 'pending',
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email }).select('+passwordHash');
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  async getMe(userId: string): Promise<AuthResponse['user']> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user._id.toString(),
      email: user.email,
      orgId: user.orgId,
    };
  }

  private buildAuthResponse(user: UserDocument): AuthResponse {
    const id = user._id.toString();
    const payload = {
      sub: id,
      email: user.email,
      orgId: user.orgId,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id,
        email: user.email,
        orgId: user.orgId,
      },
    };
  }
}
