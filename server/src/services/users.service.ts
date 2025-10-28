import { hash } from 'bcrypt';
import { CreateUserDto } from '@dtos/users.dto';
import { HttpException } from '@exceptions/HttpException';
import { User } from '@interfaces/users.interface';
import userModel from '@models/users.model';
import { isEmpty } from '@utils/util';
import { v4 as uuidv4 } from 'uuid';
import { ADMINUSER_PASSWORD, ADMINUSER_USERNAME } from '@/config';

class UserService {
  public users = userModel;

  constructor() {
    this.initAdmin();
  }

  private async initAdmin() {
    // await this.users.deleteMany({ username: "admin" });
    console.log("admin init")
    try {
      const findUser: User = await this.users.findOne({ username: ADMINUSER_USERNAME });
      const hashedPassword = await hash(ADMINUSER_PASSWORD, 10);
      if (!findUser) {
        console.log("creating admin user")
        await this.users.create({ username:ADMINUSER_USERNAME, password: hashedPassword, is_admin: true, is_active: true, user_id: "5b96fd82-4092-4542-a9a2-bceb7df852dd" });
      }
      else {
        console.log("found admin")
        await this.users.findOneAndUpdate({username: ADMINUSER_USERNAME}, {password: hashedPassword, is_admin: true, is_active: true})
      }
    }
    catch(e) { console.log(e)}
  }

  public async findAllUser(): Promise<User[]> {
    const users: User[] = await this.users.find({}, {_id: 0, username:1, user_id: 1, is_admin: 1});
    return users;
  }

  public async findUserById(userId: string): Promise<User> {
    if (isEmpty(userId)) throw new HttpException(400, "You're not userId");

    const findUser: User = await this.users.findOne({ _id: userId });
    if (!findUser) throw new HttpException(409, "You're not user");

    return findUser;
  }

  public async createUser(userData: CreateUserDto): Promise<User> {
    if (isEmpty(userData)) throw new HttpException(400, "You're not userData");

    const findUser: User = await this.users.findOne({ username: userData.username });
    if (findUser) throw new HttpException(409, `You're username ${userData.username} already exists`);

    const hashedPassword = await hash(userData.password, 10);
    const createUserData: User = await this.users.create({ ...userData, password: hashedPassword, user_id: uuidv4() });

    return createUserData;
  }

  public async updateUser(userId: string, userData: CreateUserDto): Promise<User> {
    if (isEmpty(userData)) throw new HttpException(400, "You're not userData");

    if (userData.username) {
      const findUser: User = await this.users.findOne({ username: userData.username });
      if (findUser && findUser.user_id != userId) throw new HttpException(409, `You're username ${userData.username} already exists`);
    }

    if (userData.password) {
      const hashedPassword = await hash(userData.password, 10);
      userData = { ...userData, password: hashedPassword };
    }

    const updateUserById: User = await this.users.findByIdAndUpdate(userId, { userData });
    if (!updateUserById) throw new HttpException(409, "You're not user");

    return updateUserById;
  }

  public async deleteUser(userId: string): Promise<User> {
    const deleteUserById: User = await this.users.findByIdAndDelete(userId);
    if (!deleteUserById) throw new HttpException(409, "You're not user");

    return deleteUserById;
  }
}

export default UserService;
