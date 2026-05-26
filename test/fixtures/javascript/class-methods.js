class UserService {
  constructor(db) {
    this.db = db;
  }

  async fetchUser(id) {
    const user = await this.db.findById(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  async updateUser(id, data) {
    const user = await this.fetchUser(id);
    Object.assign(user, data);
    await this.db.save(user);
    return user;
  }

  async deleteUser(id) {
    const user = await this.fetchUser(id);
    await this.db.remove(user);
    return { deleted: true };
  }

  validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
}

const helpers = {
  formatName: (first, last) => `${first} ${last}`,
  capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
};
