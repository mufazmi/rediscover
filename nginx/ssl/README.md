# SSL Certificate Setup

📖 **For comprehensive SSL setup instructions, see [docs/SSL_CERTIFICATE_SETUP.md](../docs/SSL_CERTIFICATE_SETUP.md)**

This directory is for SSL certificate files when enabling HTTPS for the reverse proxy deployment. For detailed setup instructions, troubleshooting, and security best practices, refer to the comprehensive SSL Certificate Setup Guide.

## Quick Reference

This directory is for SSL certificate files when enabling HTTPS for the reverse proxy deployment.

## Directory Structure

```
nginx/ssl/
├── README.md           # This documentation
├── .gitkeep           # Ensures directory is tracked in git
├── cert.pem.example   # Example certificate file (placeholder)
├── key.pem.example    # Example private key file (placeholder)
├── cert.pem           # Your actual SSL certificate (not in git)
└── key.pem            # Your actual SSL private key (not in git)
```

## Required Files

Place your SSL certificate files here with these exact names:
- `cert.pem` - SSL certificate file (full certificate chain)
- `key.pem` - SSL private key file

**Note**: The `.pem.example` files are placeholders showing the expected format. Replace them with your actual certificate files.

## SSL Certificate Installation Methods

### Method 1: Let's Encrypt (Recommended for production)

Let's Encrypt provides free SSL certificates with automatic renewal:

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Stop nginx if running to free port 80
docker-compose -f docker-compose.prod.yml down

# Generate certificate (replace your-domain.com with your actual domain)
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to this directory
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./nginx/ssl/key.pem

# Set proper permissions
sudo chown $USER:$USER ./nginx/ssl/*.pem
chmod 644 ./nginx/ssl/cert.pem
chmod 600 ./nginx/ssl/key.pem
```

### Method 2: Custom Certificate Authority

If you have certificates from another CA:

```bash
# Copy your certificate files to this directory
cp /path/to/your/certificate.crt ./nginx/ssl/cert.pem
cp /path/to/your/private.key ./nginx/ssl/key.pem

# Set proper permissions
chmod 644 ./nginx/ssl/cert.pem
chmod 600 ./nginx/ssl/key.pem
```

### Method 3: Self-Signed Certificate (Development only)

For development/testing purposes only:

```bash
# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ./nginx/ssl/key.pem \
  -out ./nginx/ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Set proper permissions
chmod 644 ./nginx/ssl/cert.pem
chmod 600 ./nginx/ssl/key.pem
```

## Enable SSL Configuration

After placing your certificate files:

1. **Copy SSL configuration template**:
   ```bash
   cp nginx/conf.d/ssl.conf.template nginx/conf.d/ssl.conf
   ```

2. **Update domain name**:
   ```bash
   # Replace 'your-domain.com' with your actual domain
   sed -i 's/your-domain.com/yourdomain.com/g' nginx/conf.d/ssl.conf
   ```

3. **Uncomment server blocks**:
   Edit `nginx/conf.d/ssl.conf` and remove the `#` comments from the server blocks

4. **Restart services**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

## Verification

Test your SSL configuration:

```bash
# Check certificate validity
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Test HTTPS connection
curl -I https://your-domain.com

# Test HTTP to HTTPS redirect
curl -I http://your-domain.com
```

## Certificate Renewal

### Let's Encrypt Auto-Renewal

Set up automatic renewal with cron:

```bash
# Add to crontab (run twice daily)
echo "0 12 * * * /usr/bin/certbot renew --quiet && docker-compose -f /path/to/docker-compose.prod.yml restart nginx" | sudo crontab -
```

### Manual Renewal

```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Copy renewed certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./nginx/ssl/key.pem

# Restart nginx
docker-compose -f docker-compose.prod.yml restart nginx
```

## Security Best Practices

- **Never commit private keys**: The `.gitignore` file excludes `*.pem`, `*.crt`, and `*.key` files
- **Secure file permissions**: Private keys should be readable only by owner (600)
- **Use strong ciphers**: The SSL configuration uses modern TLS 1.2+ with secure cipher suites
- **Enable HSTS**: Strict Transport Security is enabled in the SSL configuration
- **Regular renewal**: Let's Encrypt certificates expire every 90 days
- **Monitor expiration**: Set up alerts for certificate expiration dates

## Troubleshooting

### Common Issues

1. **Permission denied errors**:
   ```bash
   sudo chown $USER:$USER nginx/ssl/*.pem
   chmod 644 nginx/ssl/cert.pem
   chmod 600 nginx/ssl/key.pem
   ```

2. **Certificate chain issues**:
   - Ensure `cert.pem` contains the full certificate chain
   - For Let's Encrypt, use `fullchain.pem` not `cert.pem`

3. **Domain mismatch**:
   - Certificate domain must match your server domain
   - Update `server_name` in `ssl.conf` to match certificate

4. **Port 443 not accessible**:
   - Check firewall settings: `sudo ufw allow 443`
   - Verify Docker port mapping in `docker-compose.prod.yml`

### Log Files

Check nginx logs for SSL-related errors:

```bash
# View nginx error logs
docker-compose -f docker-compose.prod.yml logs nginx

# Check SSL handshake issues
docker exec rediscover-nginx tail -f /var/log/nginx/error.log
```