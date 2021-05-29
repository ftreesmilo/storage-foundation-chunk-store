import './types.js';

const storage = window.storageFoundation;

export default class NativeIOFileManager {
  /**
   * Opens the file with the given name if it exists and otherwise creates a
   * new file.
   * @param {string} name
   * @returns {Promise.<NativeIOFile>}
   */
  static async open(name) {
    return storage.open(name);
  }

  /**
   * Removes the file with the given name.
   * @param {string} name
   * @returns {Promise.<void>}
   */
  static async delete(name) {
    return storage.delete(name);
  }

  /**
   * Returns all existing file names.
   * @returns {Promise.<Array.<string>>}
   */
  static async getAll() {
    return storage.getAll();
  }

  /**
   * Renames the file from old name to new name atomically.
   * @param {string} oldName
   * @param {string} newName
   * @returns {Promise.<void>}
   */
  static async rename(oldName, newName) {
    return storage.rename(oldName, newName);
  }

  /**
   * Releases unused capacity (in bytes) from the current execution context.
   * Returns the remaining amount of capacity available.
   * @param {number} amount
   * @returns {Promise.<number>}
   */
  static async releaseCapacity(amount) {
    return storage.releaseCapacity(amount);
  }

  /**
   * Requests new capacity (in bytes) for usage by the current execution
   * context. Returns the remaining amount of capacity available.
   * @param {number} amount
   * @returns {Promise.<number>}
   */
  static async requestCapacity(amount) {
    return storage.requestCapacity(amount);
  }

  /**
   * Returns the capacity available for the current execution context.
   * @returns {Promise.<number>}
   */
  static async getRemainingCapacity() {
    return storage.getRemainingCapacity();
  }
}
