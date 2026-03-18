<div align="center">

<img src="public/rediscover_banner.png" alt="Rediscover Banner" width="100%">

<br/>

# Rediscover

### A Self-Hosted Redis Management Tool with a Modern Web Interface

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://hub.docker.com/r/mufazmi/rediscover)
[![Redis](https://img.shields.io/badge/Redis-5.0%2B-red.svg)](https://redis.io)
[![npm](https://img.shields.io/badge/npm-@mufazmi/rediscover-cb3837.svg)](https://www.npmjs.com/package/@mufazmi/rediscover)

<br/>

Rediscover is a production-ready, self-hosted Redis management platform built for developers and teams who need real-time visibility, intuitive key management, and multi-instance control — all from a clean, responsive web interface.

<br/>

[**Live Demo**](#-live-demo) · [**Quick Start**](#-quick-start) · [**Installation**](#-installation) · [**Configuration**](#️-configuration) · [**Troubleshooting**](#-troubleshooting)

<br/>

</div>

---

## 🌐 Live Demo

Experience Rediscover before installing — two live instances are available for you to explore:

| Instance | URL |
|---|---|
| 🟢 Demo Server 1 | [rediscover.umairfarooqui.com](https://rediscover.umairfarooqui.com) |
| 🟢 Demo Server 2 | [rediscover1.umairfarooqui.com](https://rediscover1.umairfarooqui.com) |

**Demo Credentials** *(same for both instances)*

```
Username : admin
Password : admin@123
```

> These demo environments are shared and reset periodically. Please do not store sensitive data.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📊 **Real-time Monitoring** | Live stats, memory usage, and performance metrics streamed via WebSocket |
| 🗝️ **Key Management** | Browse, search, create, edit, and delete keys across all Redis data types |
| 🔐 **Secure Authentication** | JWT-based auth with role-based access control |
| 🌐 **Multi-Connection** | Manage multiple Redis instances simultaneously from a single interface |
| 📱 **Responsive Design** | Fully functional on desktop, tablet, and mobile — built with Tailwind CSS + Radix UI |
| ⚡ **High Performance** | Optimized loading and caching for large-scale Redis deployments |
| 🎨 **Modern UI** | Clean, distraction-free interface with thoughtful UX |
| 🔧 **Flexible Configuration** | Configure via environment variables or directly through the built-in UI |

---

## ⚡ Quick Start

Get up and running in under a minute:

**Via NPM**
```bash
npm install -g @mufazmi/rediscover && rediscover
```

**Via Docker**
```bash
docker run -d -p 3000:3000 -p 3001:3001 mufazmi/rediscover:latest
```

Open **http://localhost:3000** in your browser. ✅

---

## 📦 Installation

### System Requirements

<table>
<tr>
<th>Method</th>
<th>Dependency</th>
<th>Minimum Version</th>
</tr>
<tr>
<td rowspan="2"><b>NPM</b></td>
<td>Node.js</td>
<td>≥ 18.0.0</td>
</tr>
<tr>
<td>npm</td>
<td>≥ 8.0.0</td>
</tr>
<tr>
<td rowspan="2"><b>Docker</b></td>
<td>Docker Engine</td>
<td>≥ 20.10.0</td>
</tr>
<tr>
<td>Docker Compose</td>
<td>≥ 2.0.0 <i>(optional)</i></td>
</tr>
<tr>
<td rowspan="2"><b>All Methods</b></td>
<td>Redis Server</td>
<td>≥ 5.0.0</td>
</tr>
<tr>
<td>RAM</td>
<td>512 MB minimum</td>
</tr>
</table>

---

### Option 1 — NPM *(Recommended)*

```bash
# Install globally
npm install -g @mufazmi/rediscover

# Verify installation
rediscover --version

# Launch the application
rediscover
```

Then visit **http://localhost:3000**.

> **Tip:** If you encounter a permission error, run:
> ```bash
> npm config set prefix '~/.npm-global'
> ```
> Then add `~/.npm-global/bin` to your `PATH` and re-install.

---

### Option 2 — Docker

**Basic usage:**
```bash
docker run -d \
  --name rediscover \
  -p 3000:3000 \
  -p 3001:3001 \
  mufazmi/rediscover:latest
```

**With custom environment variables:**
```bash
docker run -d \
  --name rediscover \
  -p 3000:3000 \
  -p 3001:3001 \
  -e JWT_SECRET=your-secure-secret \
  -e REDIS_HOST=your-redis-host \
  -e REDIS_PORT=6379 \
  mufazmi/rediscover:latest
```

**Docker Compose** *(recommended for production deployments)*:

```yaml
# docker-compose.yml
version: '3.8'

services:
  rediscover:
    image: mufazmi/rediscover:latest
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - JWT_SECRET=your-secure-secret-key
      - NODE_ENV=production
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped
```

```bash
docker-compose up -d
```

---

## ⚙️ Configuration

Create a `.env` file in your working directory to customize Rediscover:

```env
# ── Server ─────────────────────────────────────────────────
PORT=3000
BACKEND_PORT=3001
NODE_ENV=production
HOST=0.0.0.0

# ── Security ────────────────────────────────────────────────
JWT_SECRET=your-very-secure-secret-key     # Required in production
JWT_EXPIRATION=24h

# ── Redis Connection ─────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TIMEOUT=5000
REDIS_TLS=false

# ── Application ──────────────────────────────────────────────
MAX_CONNECTIONS=10
SESSION_TIMEOUT=30
REFRESH_INTERVAL=5
DEBUG=false
```

### Environment Variable Reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Web UI server port |
| `BACKEND_PORT` | `3001` | Backend API server port |
| `NODE_ENV` | `development` | Runtime environment: `production` or `development` |
| `HOST` | `localhost` | Bind address — use `0.0.0.0` to expose on all interfaces |
| `JWT_SECRET` | — | **Required in production.** Secret key used to sign JWT tokens |
| `JWT_EXPIRATION` | `24h` | Token lifetime (e.g. `1h`, `7d`, `24h`) |
| `REDIS_HOST` | `localhost` | Default Redis hostname or IP address |
| `REDIS_PORT` | `6379` | Default Redis port |
| `REDIS_PASSWORD` | — | Redis AUTH password (leave blank if not set) |
| `REDIS_TIMEOUT` | `5000` | Connection timeout in milliseconds |
| `MAX_CONNECTIONS` | `10` | Maximum simultaneous Redis connections |
| `REFRESH_INTERVAL` | `5` | Dashboard auto-refresh interval in seconds |
| `SESSION_TIMEOUT` | `30` | Idle session timeout in minutes |
| `DEBUG` | `false` | Enable verbose debug logging |

> **Note:** You can also add and manage Redis connections directly from the web UI by clicking **Add Connection** and entering your server details.

---

## 🔧 Troubleshooting

<details>
<summary><b>❌ "npm: command not found" or "node: command not found"</b></summary>
<br>

Node.js is not installed on your system. Install it using one of the methods below:

```bash
# macOS
brew install node

# Ubuntu / Debian
sudo apt install nodejs npm

# CentOS / RHEL
sudo yum install nodejs npm
```

Or download the official installer at [nodejs.org](https://nodejs.org).

</details>

<details>
<summary><b>❌ "Permission denied" during npm global install</b></summary>
<br>

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g @mufazmi/rediscover
```

</details>

<details>
<summary><b>❌ Port 3000 is already in use</b></summary>
<br>

```bash
# macOS / Linux — kill the process using the port
sudo lsof -ti:3000 | xargs kill -9

# Windows — find and kill the process
netstat -ano | findstr :3000
# Then: taskkill /PID <PID> /F

# Alternatively, run on a different port
PORT=3005 rediscover
```

</details>

<details>
<summary><b>❌ Cannot connect to Redis server</b></summary>
<br>

```bash
# Verify Redis is running
redis-cli ping   # Expected response: PONG

# Install Redis if not present
sudo apt install redis-server          # Ubuntu / Debian
brew install redis && brew services start redis   # macOS
sudo yum install redis                 # CentOS / RHEL
```

Also verify:
- Port `6379` is open in your firewall rules
- The `bind` directive in `redis.conf` permits connections from your host

</details>

<details>
<summary><b>❌ "Authentication failed" when connecting to Redis</b></summary>
<br>

- Check the `requirepass` directive in your `redis.conf`
- Ensure `REDIS_PASSWORD` in your `.env` matches exactly
- Test manually: `redis-cli -a your-password ping`

</details>

<details>
<summary><b>❌ "Docker: permission denied"</b></summary>
<br>

```bash
sudo usermod -aG docker $USER
newgrp docker   # Apply group change without logging out
```

</details>

<details>
<summary><b>❌ Container exits immediately after starting</b></summary>
<br>

```bash
# Inspect startup logs
docker logs rediscover

# Run interactively to debug
docker run -it --rm -p 3000:3000 -p 3001:3001 mufazmi/rediscover:latest
```

</details>

<details>
<summary><b>❌ JWT_SECRET warning on startup</b></summary>
<br>

```bash
# Export inline
export JWT_SECRET="your-secure-key" && rediscover

# Or persist in .env
echo 'JWT_SECRET=your-secure-key' >> .env
```

</details>

<details>
<summary><b>❌ Blank page or UI not loading</b></summary>
<br>

- Confirm JavaScript is enabled in your browser
- Temporarily disable browser extensions or ad blockers
- Use a modern browser: Chrome 90+, Firefox 88+, Safari 14+
- Open **DevTools → Console** and look for JavaScript errors

</details>

**Enable debug mode** for detailed diagnostic logs:
```bash
DEBUG=true rediscover
```

Still stuck? [Open a GitHub Issue](https://github.com/mufazmi/rediscover/issues) with your OS, Node.js version, install method, and full error output.

---

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/mufazmi/rediscover.git
cd rediscover

# Install dependencies
npm install

# Start the development server
npm run dev

# Run the test suite
npm test

# Build for production
npm run build
```

---

## 🤝 Contributing

Contributions are welcome and appreciated — whether it's a bug fix, new feature, documentation improvement, or a question.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add: your feature description'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes.

---

## 👨‍💻 Author

**Umair Farooqui** — Software Engineer & Certified Ethical Hacker (CEH v13)

[![Website](https://img.shields.io/badge/Website-umairfarooqui.com-red)](https://umairfarooqui.com)
[![GitHub](https://img.shields.io/badge/GitHub-mufazmi-181717?logo=github)](https://github.com/mufazmi)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-umairfarooqui-0A66C2?logo=linkedin)](https://linkedin.com/in/mufazmi)
[![HackerOne](https://img.shields.io/badge/HackerOne-mufazmi-494649?logo=hackerone)](https://hackerone.com/mufazmi)
[![Medium](https://img.shields.io/badge/Medium-mufazmi-000000?logo=medium)](https://medium.com/@mufazmi)
[![Email](https://img.shields.io/badge/Email-info.umairfarooqui%40gmail.com-EA4335?logo=gmail)](mailto:info.umairfarooqui@gmail.com)

### 🏆 Security Recognition

Recognized by leading global organizations for responsible vulnerability disclosure:

`NASA` · `Dell Technologies` · `Nokia` · `Lenovo` · `Zoom` · `LG` · `ABN AMRO Bank` · `Accenture` · `Paytm` · `U.S. Department of Homeland Security` · `WHO` · `United Airlines` · `Drexel University` · `Radboud University`

---

## 📄 License

Released under the [MIT License](LICENSE). Free to use, modify, and distribute — attribution appreciated.

---

<div align="center">

**Made with ❤️ by [Umair Farooqui](https://github.com/mufazmi)**

*If Rediscover saves you time, a ⭐ on GitHub goes a long way — thank you!*

</div>