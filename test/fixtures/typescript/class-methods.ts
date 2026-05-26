interface UserService {
  fetchUser(id: string): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
}

interface User {
  id: string;
  name: string;
  email: string;
}

class UserServiceImpl implements UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async fetchUser(id: string): Promise<User> {
    const user = await this.db.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.fetchUser(id);
    Object.assign(user, data);
    await this.db.save(user);
    return user;
  }

  async deleteUser(id: string): Promise<{ deleted: boolean }> {
    const user = await this.fetchUser(id);
    await this.db.remove(user);
    return { deleted: true };
  }

  validateEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
}

type Database = {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  remove(user: User): Promise<void>;
};

enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

const formatUser = (user: User): string => `${user.name} <${user.email}>`;

function isValidId(id: string): boolean {
  return /^[a-f0-9]{24}$/.test(id);
}
