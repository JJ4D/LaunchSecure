# Environment Variable Setup

## Turbot Pipes Authentication Token

To install Steampipe plugins, you need a Turbot Pipes authentication token.

### Getting Your Token

1. Sign up or log in at https://pipes.turbot.com
2. Go to your account settings
3. Generate or copy your API token

### Setting the Token

Create a `.env` file in the project root (it's already in `.gitignore`):

```bash
PIPES_TOKEN=your_turbot_token_here
```

Or set it directly in your shell:

```bash
# Windows PowerShell
$env:PIPES_TOKEN="your_turbot_token_here"

# Linux/Mac
export PIPES_TOKEN="your_turbot_token_here"
```

### Docker Compose

The `docker-compose.yml` file will automatically read the `PIPES_TOKEN` from your environment or `.env` file.

After setting the token, restart the steampipe-powerpipe service:

```bash
docker-compose down steampipe-powerpipe
docker-compose up steampipe-powerpipe -d
```

The AWS plugin should install automatically on startup.

