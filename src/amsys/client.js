const { spawn } = require('child_process');

class AmsysClient {
  constructor(amsysPath, workingDir) {
    this.amsysPath = amsysPath;
    this.workingDir = workingDir;
  }

  async execCommand(cmd) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.amsysPath, ['--exec=' + cmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.workingDir
      });

      let output = '';
      let error = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        try {
          const trimmed = output.trim();
          if (trimmed) {
            resolve(JSON.parse(trimmed));
          } else {
            resolve({ success: false, error: 'No output' });
          }
        } catch (e) {
          resolve({ success: false, error: e.message, raw: output });
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  async toWindows(unixPath) {
    const result = await this.execCommand(`to_windows ${unixPath}`);
    return result;
  }

  async resolve(unixPath) {
    const result = await this.execCommand(`resolve ${unixPath}`);
    return result;
  }

  async listDir(unixPath) {
    const result = await this.execCommand(`list_dir ${unixPath}`);
    return result;
  }

  close() {
  }
}

let instance = null;

function getAmsysClient(amsysPath, workingDir) {
  if (!instance) {
    instance = new AmsysClient(amsysPath, workingDir);
  }
  return instance;
}

module.exports = { AmsysClient, getAmsysClient };