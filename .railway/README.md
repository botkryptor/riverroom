# Railway deployment

Infrastructure is defined in `railway.ts`:

- GitHub source: `botkryptor/riverroom`, branch `main`
- Region: Singapore
- Runtime: Node.js 22+ through Railpack
- Health check: `/health`
- Persistent volume: 500 MB mounted at `/app/data`
- Application data directory: `/app/data`

## First deployment

```bash
railway login
railway init
railway config plan
railway config apply
railway service link web
railway domain
```

If Railway asks for GitHub access, authorize only the `riverroom` repository.

After the first apply and granting the Railway GitHub App access to this private
repository, pushes to `main` deploy automatically through the GitHub source
connection.

Live service: https://web-production-9aa1c.up.railway.app
