import { hash, compare } from 'bcrypt';
import { sign } from 'jsonwebtoken';
import {
  SECRET_KEY,
  AUTOMATION_TOKEN,
  SMTP_SECURE,
  REQUIRE_ACTIVATION,
  API_URL_EXTERNAL,
  SMTP_SERVER,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_SENDER,
} from '@config';
import { LoginDto, SignupDto, ActivationDto } from '@dtos/users.dto';
import { HttpException } from '@exceptions/HttpException';
import { DataStoredInToken, TokenData } from '@interfaces/auth.interface';
import { User, PasswordToken } from '@interfaces/users.interface';
import userModel from '@models/users.model';
import passwordTokenModel from '@models/password_token.model';
import { isEmpty } from '@utils/util';
import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';

const nodemailer = require('nodemailer');

export const mailTransport = nodemailer.createTransport({
  host: SMTP_SERVER,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  debug: false,
  logger: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD,
  },
});

class AuthService {
  public async signup(userData: SignupDto): Promise<User> {
    if (isEmpty(userData)) throw new HttpException(400, 'Invalid request data.');

    const findUser: User = await userModel.findOne({ username: userData.username });
    if (findUser) throw new HttpException(409, 'User allready exists');

    const hashedPassword = await hash(userData.password, 10);
    if (REQUIRE_ACTIVATION) {
      const activation_code = uuidv4();
      const createUserData: User = await userModel.create({
        ...userData,
        password: hashedPassword,
        is_active: false,
        activation_code: activation_code,
        user_id: uuidv4(),
      });

      const info = await mailTransport.sendMail({
        from: SMTP_SENDER, // sender address
        to: userData.username, // list of receivers
        subject: 'Please activate your Plantalytix account', // Subject line
        text: 'Activation url: ' + API_URL_EXTERNAL + '/login?code=' + activation_code,
      });

      return createUserData;
    } else {
      const activation_code = uuidv4();
      const createUserData: User = await userModel.create({
        ...userData,
        password: hashedPassword,
        is_active: true,
        activation_code: activation_code,
        user_id: uuidv4(),
      });
      return createUserData;
    }
  }

  public async generatePasswordToken(username: string): Promise<void> {
    const findUser: User = await userModel.findOne({ username: username });
    if (!findUser) throw new HttpException(409, 'Invalid user');

    const token = uuidv4();
    passwordTokenModel.create({ token: token, user_id: findUser.user_id });
    const info = await mailTransport.sendMail({
      from: SMTP_SENDER, // sender address
      to: username, // list of receivers
      subject: 'Reset your Plantalytix password', // Subject line
      text: 'Change password: ' + API_URL_EXTERNAL + '/login?recovery=' + token,
    });
  }

  public async activate(userData: ActivationDto): Promise<boolean> {
    if (isEmpty(userData)) throw new HttpException(400, 'Invalid request data.');

    const findUser: User = await userModel.findOne({ activation_code: userData.activation_code });
    if (!findUser) throw new HttpException(409, 'Wrong activation code');

    await userModel.findOneAndUpdate({ activation_code: userData.activation_code }, { is_active: true });
    return true;
  }

  public async login(userData: LoginDto): Promise<{ userToken: TokenData; refreshToken: TokenData; findUser: User }> {
    if (isEmpty(userData)) throw new HttpException(400, 'Invalid request data.');

    const findUser: User = await userModel.findOne(
      { username: userData.username },
      { _id: 0, username: 1, user_id: 1, is_admin: 1, password: 1, is_active: 1 },
    );
    if (!findUser) throw new HttpException(409, 'Wrong email/password');

    const isPasswordMatching: boolean = await compare(userData.password, findUser.password);
    if (!isPasswordMatching) throw new HttpException(409, 'Wrong email/password');

    if (!findUser.is_active) throw new HttpException(409, 'User not activated');

    const { userToken, refreshToken } = this.createTokensFromUser(findUser, userData.stayLoggedIn);
    // const cookie = this.createCookie(tokenData);

    return { userToken, refreshToken, findUser };
  }

  public async changePassword(user_id: string, password: string): Promise<void> {
    const findUser: User = await userModel.findOne({ user_id: user_id }, { _id: 0, username: 1, user_id: 1, is_admin: 1, password: 1, is_active: 1 });
    if (!findUser) throw new HttpException(409, 'Wrong email/password');
    const hashedPassword = await hash(password, 10);

    await userModel.findOneAndUpdate({ user_id: user_id }, { password: hashedPassword });
  }

  public async changePasswordWithToken(token: string, password: string): Promise<void> {
    const pwtoken: PasswordToken = await passwordTokenModel.findOne({
      token: token,
      createdAt: { $gt: DateTime.now().minus({ days: 1 }).toISODate() },
    });
    if (!pwtoken) throw new HttpException(409, 'Wrong token');
    const hashedPassword = await hash(password, 10);
    await userModel.findOneAndUpdate({ user_id: pwtoken.user_id }, { password: hashedPassword });
  }

  public async loginWithToken(token: string): Promise<{ userToken: TokenData }> {
    if (token != AUTOMATION_TOKEN) {
      throw new HttpException(401, 'Wrong authentication token');
    }

    const dataStoredInToken: DataStoredInToken = {
      user_id: '',
      is_admin: true,
    };

    const token_expiration: number = 5 * 60;

    return {
      userToken: { expiresIn: token_expiration, token: sign(dataStoredInToken, SECRET_KEY, { expiresIn: token_expiration }) },
    };
  }

  public async refresh(tokenData: DataStoredInToken): Promise<{ userToken: TokenData; refreshToken: TokenData }> {
    const { userToken, refreshToken } = this.createTokens({
      user_id: tokenData.user_id,
      is_admin: tokenData.is_admin,
      stay_logged_in: tokenData.stay_logged_in,
    });
    return { userToken, refreshToken };
  }

  public async logout(userData: User): Promise<User> {
    if (isEmpty(userData)) throw new HttpException(400, "You're not userData");

    const findUser: User = await userModel.findOne({ username: userData.username, password: userData.password });
    if (!findUser) throw new HttpException(409, `You're username ${userData.username} not found`);

    return findUser;
  }

  public createTokensFromUser(user: User, stayLoggedIn: boolean): { userToken: TokenData; refreshToken: TokenData } {
    const dataStoredInToken: DataStoredInToken = {
      user_id: user.user_id,
      is_admin: user.is_admin,
      stay_logged_in: stayLoggedIn,
    };

    return this.createTokens(dataStoredInToken);
  }

  public createTokens(dataStoredInToken: DataStoredInToken): { userToken: TokenData; refreshToken: TokenData } {
    const token_expiration: number = 5 * 60;
    const refresh_expiration: number = (dataStoredInToken.stay_logged_in ? 30 * 24 * 60 : 30) * 60;

    return {
      userToken: { expiresIn: token_expiration, token: sign(dataStoredInToken, SECRET_KEY, { expiresIn: token_expiration }) },
      refreshToken: { expiresIn: refresh_expiration, token: sign(dataStoredInToken, SECRET_KEY, { expiresIn: refresh_expiration }) },
    };
  }
}

export default AuthService;
