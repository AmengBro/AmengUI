const fs = require('fs').promises;
const path = require('node:path');

class PathConverter {
  constructor(configPath, fstabPath) {
    this.configPath = configPath;
    this.fstabPath = fstabPath;
    this.root = 'C:\\amsys_root';
    this.mounts = {};
  }

  async init() {
    await this.loadConfig();
    await this.loadFstab();
    this.mounts['/'] = this.root;
    this.mounts['/home'] = path.join(this.root, 'home');
    this.mounts['/usr'] = path.join(this.root, 'usr');
    this.mounts['/tmp'] = path.join(this.root, 'tmp');
    this.mounts['/var'] = path.join(this.root, 'var');
    this.mounts['/etc'] = path.join(this.root, 'etc');
    this.mounts['/opt'] = path.join(this.root, 'opt');
    this.mounts['/bin'] = path.join(this.root, 'bin');
    this.mounts['/lib'] = path.join(this.root, 'lib');
  }

  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const lines = content.split('\n');
      let inSystemSection = false;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[system]')) {
          inSystemSection = true;
          continue;
        }
        if (trimmed.startsWith('[') && inSystemSection) {
          break;
        }
        if (inSystemSection) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1).trim();
            if (key === 'root') {
              this.root = path.resolve(this.configPath, '..', value);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load config.ini, using default root:', e.message);
    }
  }

  async loadFstab() {
    try {
      const content = await fs.readFile(this.fstabPath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed === '') {
          continue;
        }
        const parts = trimmed.split(/\s+/).filter(p => p !== '');
        if (parts.length >= 2) {
          const winPath = parts[0].replace(/\/$/, '');
          const unixPath = parts[1];
          this.mounts[unixPath] = winPath;
        }
      }
    } catch (e) {
      console.warn('Failed to load fstab:', e.message);
    }
  }

  resolve(unixPath) {
    if (!unixPath || unixPath === '/') return '/';
    
    let p = unixPath.replace(/\\/g, '/');
    if (!p.startsWith('/')) {
      p = '/' + p;
    }
    
    const parts = p.split('/').filter(p => p !== '');
    const result = [];
    
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        if (result.length > 0) result.pop();
        continue;
      }
      result.push(part);
    }
    
    if (result.length === 0) return '/';
    return '/' + result.join('/');
  }

  async toWindows(unixPath) {
    const resolved = this.resolve(unixPath);
    if (!resolved || resolved === '/') {
      return { success: true, winPath: this.root + '\\' };
    }

    if (resolved.startsWith('/mnt/') || resolved.startsWith('/media/')) {
      const driveLetter = resolved.split('/')[2];
      if (driveLetter && driveLetter.length === 1) {
        const remaining = resolved.substring(5);
        return { success: true, winPath: driveLetter.toUpperCase() + ':' + remaining.replace(/\//g, '\\') };
      }
    }

    const parts = resolved.substring(1).split('/');
    if (parts.length === 0) {
      return { success: true, winPath: this.root + '\\' };
    }

    const topComponent = parts[0];
    const rest = parts.slice(1).join('\\');

    let winBase = this.mounts['/' + topComponent] || path.join(this.root, topComponent);
    
    if (rest) {
      return { success: true, winPath: path.join(winBase, rest) };
    }
    
    return { success: true, winPath: winBase };
  }

  async listDir(unixPath) {
    const result = await this.toWindows(unixPath);
    if (!result.success || !result.winPath) {
      return { success: false, error: 'Invalid path' };
    }

    try {
      const entries = await fs.readdir(result.winPath, { withFileTypes: true });
      const items = [];
      
      for (const entry of entries) {
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'dir' : 'file',
          size: entry.isFile() ? (await fs.stat(path.join(result.winPath, entry.name))).size : 0,
          mtime: (await fs.stat(path.join(result.winPath, entry.name))).mtime.toISOString()
        });
      }
      
      return { success: true, entries: items };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

let instance = null;

async function getPathConverter(appRoot) {
  if (!instance) {
    const configPath = path.join(appRoot, 'config.ini');
    const fstabPath = path.join(appRoot, 'rootdir', 'etc', 'fstab');
    instance = new PathConverter(configPath, fstabPath);
    await instance.init();
  }
  return instance;
}

module.exports = { PathConverter, getPathConverter };