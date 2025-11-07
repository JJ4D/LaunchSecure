# Build custom image with Debian 12 (Bookworm) for GLIBC 2.36+ support
# This allows Powerpipe to work without compatibility issues
FROM debian:bookworm-slim

WORKDIR /workspace

# Install dependencies
RUN apt-get update && \
    apt-get install -y \
    wget curl git \
    gcc g++ pkg-config libc6-dev \
    postgresql-client \
    ca-certificates \
    sudo && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    echo "steampipe ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create steampipe user
RUN useradd -m -s /bin/bash steampipe && \
    mkdir -p /home/steampipe/.steampipe/config \
             /home/steampipe/.steampipe/plugins \
             /home/steampipe/.powerpipe/config \
             /home/steampipe/.powerpipe/internal \
             /workspace && \
    chown -R steampipe:steampipe /home/steampipe /workspace && \
    chmod -R 755 /home/steampipe/.steampipe /home/steampipe/.powerpipe /workspace

# Install Steampipe
RUN cd /tmp && \
    wget -q https://github.com/turbot/steampipe/releases/latest/download/steampipe_linux_amd64.tar.gz && \
    tar -xzf steampipe_linux_amd64.tar.gz && \
    mv steampipe /usr/local/bin/steampipe && \
    chmod +x /usr/local/bin/steampipe && \
    rm -f steampipe_linux_amd64.tar.gz

# Install Go for building Powerpipe
RUN cd /tmp && \
    curl -L https://go.dev/dl/go1.22.0.linux-amd64.tar.gz -o go.tar.gz && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz

ENV PATH="/usr/local/go/bin:/usr/local/bin:${PATH}"

# Build Powerpipe from source (will work with Debian 12's GLIBC)
RUN cd /tmp && \
    git clone --depth 1 https://github.com/turbot/powerpipe.git && \
    cd powerpipe && \
    go build -ldflags="-s -w" -o /usr/local/bin/powerpipe . && \
    chmod +x /usr/local/bin/powerpipe && \
    rm -rf /tmp/powerpipe

# Switch to steampipe user
USER steampipe

# Copy Powerpipe configuration
COPY default.spc /tmp/default.spc
COPY workspace.spc /tmp/workspace.spc

# Set up Powerpipe workspace and mods
RUN powerpipe mod init /workspace 2>/dev/null || true && \
    powerpipe mod install github.com/turbot/steampipe-mod-aws-compliance --workspace /workspace 2>/dev/null || true

# Create startup script
RUN echo '#!/bin/bash' > /tmp/start.sh && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /tmp/start.sh && \
    echo '# Fix permissions for mounted volumes' >> /tmp/start.sh && \
    echo 'sudo chown -R steampipe:steampipe /home/steampipe/.steampipe /home/steampipe/.powerpipe /workspace 2>/dev/null || true' >> /tmp/start.sh && \
    echo 'sudo chmod -R 755 /home/steampipe/.steampipe /home/steampipe/.powerpipe /workspace 2>/dev/null || true' >> /tmp/start.sh && \
    echo 'cp /tmp/default.spc /home/steampipe/.powerpipe/config/default.spc 2>/dev/null || true' >> /tmp/start.sh && \
    echo 'cp /tmp/workspace.spc /workspace/workspace.spc 2>/dev/null || true' >> /tmp/start.sh && \
    echo 'cd /workspace' >> /tmp/start.sh && \
    echo 'if [ ! -f mod.pp ]; then' >> /tmp/start.sh && \
    echo '  powerpipe mod init 2>/dev/null || true' >> /tmp/start.sh && \
    echo '  powerpipe mod install github.com/turbot/steampipe-mod-aws-compliance 2>/dev/null || true' >> /tmp/start.sh && \
    echo 'fi' >> /tmp/start.sh && \
    echo '# Authenticate with Turbot Pipes using PIPES_TOKEN' >> /tmp/start.sh && \
    echo 'if [ -n "$PIPES_TOKEN" ]; then' >> /tmp/start.sh && \
    echo '  echo "Authenticating with Turbot Pipes..."' >> /tmp/start.sh && \
    echo '  steampipe login --pipes-token "$PIPES_TOKEN" 2>&1 || echo "Login failed (may already be logged in)"' >> /tmp/start.sh && \
    echo 'else' >> /tmp/start.sh && \
    echo '  echo "Warning: PIPES_TOKEN not set - plugin installation may fail with 403"' >> /tmp/start.sh && \
    echo 'fi' >> /tmp/start.sh && \
    echo '# Install AWS plugin if not already installed' >> /tmp/start.sh && \
    echo 'if [ ! -d "/home/steampipe/.steampipe/plugins/turbot/aws" ]; then' >> /tmp/start.sh && \
    echo '  echo "Attempting to install AWS plugin..."' >> /tmp/start.sh && \
    echo '  if [ -n "$PIPES_TOKEN" ]; then' >> /tmp/start.sh && \
    echo '    steampipe plugin install aws 2>&1 || echo "Plugin install failed - check PIPES_TOKEN"' >> /tmp/start.sh && \
    echo '  else' >> /tmp/start.sh && \
    echo '    steampipe plugin install aws 2>&1 || echo "Plugin install failed - ensure PIPES_TOKEN is set"' >> /tmp/start.sh && \
    echo '  fi' >> /tmp/start.sh && \
    echo 'fi' >> /tmp/start.sh && \
    echo '# Start Steampipe service - keep container running even if it fails' >> /tmp/start.sh && \
    echo 'steampipe service start --foreground --database-listen network || echo "Steampipe service failed to start, but container will keep running"' >> /tmp/start.sh && \
    echo '# Keep container alive even if service fails' >> /tmp/start.sh && \
    echo 'while true; do sleep 30; done' >> /tmp/start.sh && \
    chmod +x /tmp/start.sh

# Override entrypoint to run our startup script
ENTRYPOINT ["/bin/bash"]
CMD ["/tmp/start.sh"]
