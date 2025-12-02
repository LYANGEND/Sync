# Hosting Multiple Sites with Nginx Reverse Proxy

Since your server already hosts other websites using Nginx, you cannot let the Docker container take over port 80 directly. Instead, we will run the Docker container on a different port (8080) and tell your main server Nginx to forward traffic to it.

## 1. The Change We Made
We updated `docker-compose.prod.yml` to expose the app on port **8080** instead of 80:
```yaml
  nginx:
    # ...
    ports:
      - "8080:80"
```

## 2. Configure Your Host Nginx

1.  **SSH into your server**.
2.  **Create a new Nginx configuration file** for this app:
    ```bash
    sudo nano /etc/nginx/sites-available/sync-app
    ```
3.  **Paste the following configuration** (replace `your-domain.com` with your actual domain):

    ```nginx
    server {
        listen 80;
        server_name your-domain.com www.your-domain.com;

        location / {
            # Forward requests to the Docker container running on port 8080
            proxy_pass http://127.0.0.1:8080;
            
            # Standard proxy headers
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    ```
4.  **Enable the site**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/sync-app /etc/nginx/sites-enabled/
    ```
5.  **Test the configuration**:
    ```bash
    sudo nginx -t
    ```
6.  **Reload Nginx**:
    ```bash
    sudo systemctl reload nginx
    ```

## 3. Deploy
Now, simply push your changes to GitHub. The CI/CD pipeline will update the Docker container to listen on port 8080, and your host Nginx will route traffic to it.
