FROM ghcr.io/turbot/steampipe:latest

WORKDIR /workspace

# Copy installation script and config
COPY install-powerpipe.sh /tmp/install-powerpipe.sh
COPY default.spc /tmp/default.spc
COPY workspace.spc /tmp/workspace.spc

# Keep container running - Powerpipe will be installed at startup via docker-compose command
CMD ["sh", "-c", "tail -f /dev/null"]
