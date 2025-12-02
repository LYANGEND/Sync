# Deployment Guide

This project uses GitHub Actions for CI/CD and Docker for containerization.

## Prerequisites

1.  **VPS (Virtual Private Server)**: A server running Ubuntu (or similar Linux) with Docker and Docker Compose installed.
2.  **Domain Name**: Pointed to your VPS IP address.

## Server Setup

1.  **SSH into your server**.
2.  **Install Docker & Docker Compose**:
    ```bash
    sudo apt update
    sudo apt install docker.io docker-compose -y
    sudo usermod -aG docker $USER
    # Log out and log back in for group changes to take effect
    ```
3.  **Create the app directory**:
    ```bash
    mkdir -p ~/app
    ```

## GitHub Repository Setup

1.  Go to your GitHub repository **Settings** > **Secrets and variables** > **Actions**.
2.  Add the following **Repository secrets**:

    | Secret Name | Description |
    | :--- | :--- |
    | `HOST` | The IP address of your VPS. |
    | `USERNAME` | The SSH username (e.g., `root` or `ubuntu`). |
    | `SSH_KEY` | The private SSH key to access your server. |
    | `POSTGRES_USER` | Database username (e.g., `sync_user`). |
    | `POSTGRES_PASSWORD` | Database password (make it strong!). |
    | `POSTGRES_DB` | Database name (e.g., `sync_db`). |
    | `JWT_SECRET` | Secret key for JWT tokens (random string). |

## How it Works

1.  **Push to `master`**: When you push code to the `master` branch, the GitHub Action triggers.
2.  **Build**: It builds Docker images for the Backend and Frontend.
3.  **Push**: It pushes these images to the GitHub Container Registry (GHCR).
4.  **Deploy**: It logs into your server via SSH, copies the `docker-compose.prod.yml` and `nginx.conf`, pulls the new images, and restarts the containers.

## Troubleshooting

*   **Permission Denied**: Ensure the `SSH_KEY` is correct and the public key is in `~/.ssh/authorized_keys` on the server.
*   **Image Pull Error**: Ensure the GitHub Action successfully pushed the images to GHCR and that the image names in `docker-compose.prod.yml` match (lowercase).
*   **Database Connection**: Check the logs with `docker logs sync_backend`.
