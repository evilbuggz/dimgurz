# Dimgur: Vercel Activity + local Discord bot

The Activity website and its API are deployed on Vercel. `run.bat` runs the Discord bot on your PC; keep its window open while people use the Activity. The source `.env` is for the local bot and command registration. Add the API secrets separately to Vercel's project settings.

## 1. Deploy the Activity on Vercel

1. Push this project to a GitHub, GitLab, or Bitbucket repository, or deploy it from the project folder using the Vercel CLI.
2. In Vercel, create a project from the repository. The included `vercel.json` selects Vite, runs `npm run build`, and serves the generated `dist` directory. The `/api` handlers are deployed as Vercel Functions.
3. In the Vercel project, open **Settings > Environment Variables** and add these values for Production (and Preview if you plan to use previews):
   - `DISCORD_CLIENT_ID` — Discord Application/OAuth2 Client ID.
   - `DISCORD_CLIENT_SECRET` — Discord OAuth2 Client Secret.
   - `DISCORD_BOT_TOKEN` — Discord Bot token.
   - `IMGUR_CLIENT_ID` — Imgur application Client ID.
4. Redeploy after adding or changing environment variables. Open the deployed site's `/api/config` address; it should return JSON with a non-empty `discordClientId`.
5. Copy the host from your Vercel deployment, for example `dimgur-example.vercel.app` (without `https://` or a trailing slash).

## 2. Set the Discord Activity URL mapping

1. In the [Discord Developer Portal](https://discord.com/developers/applications), open your app and go to **Activities > Settings**. Enable Activities.
2. Go to **Activities > URL Mappings** and add a mapping with **Prefix** `/` and **Target** set to the Vercel host copied above, such as `dimgur-example.vercel.app`.
3. Save the mapping. The Vercel hostname stays stable between deployments; use your production domain if you add a custom domain later.
4. Under **OAuth2 > Redirects**, keep `https://127.0.0.1` registered for the Embedded App SDK authorization flow.

The mapping tells Discord which public site to load inside the Activity. Vercel supplies HTTPS, so you do not need a separate tunnel or to run the website on your PC.

## 3. Set up and run the bot

1. In `.env`, fill `DISCORD_APPLICATION_ID`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_BOT_TOKEN`. The Application ID and Client ID are normally the same value. Keep this file private.
2. Add the bot to your Discord server using an install link with `bot` and `applications.commands` scopes. Give it **Send Messages** and **Embed Links** permissions in the channels where people will use Dimgur.
3. Double-click `run.bat`. It registers/updates the `/dimgur` Activity command and then logs the bot in. Leave the window open. Successful startup prints `Dimgur bot is online as ...`.
4. Use `/dimgur` in a server text channel where the bot has permission. The Activity page/API come from Vercel; the local bot sends the selected GIF to Discord.

If you change the Vercel domain, update the Activity URL mapping. If you rotate the bot token, update it both in the local `.env` and Vercel's environment variables, then restart the bot and redeploy the Vercel project.

## Imgur Client ID

Register an application from the [Imgur API documentation](https://apidocs.imgur.com/) and put its **Client ID** in Vercel as `IMGUR_CLIENT_ID`. Dimgur searches public GIFs and does not need an Imgur client secret or user OAuth.

## Environment variables

| Variable | Used by | Where to find it |
| --- | --- | --- |
| `DISCORD_APPLICATION_ID` | Local bot command registration | Developer Portal > General Information > Application ID |
| `DISCORD_CLIENT_ID` | Local command registration and Vercel Activity API | Developer Portal > OAuth2 > Client ID |
| `DISCORD_CLIENT_SECRET` | Vercel Activity API | Developer Portal > OAuth2 > Client Secret |
| `DISCORD_BOT_TOKEN` | Local bot and Vercel message API | Developer Portal > Bot > Token |
| `IMGUR_CLIENT_ID` | Vercel search API | Imgur application registration > Client ID |

Never commit `.env` or paste bot tokens/client secrets into browser code or Discord's URL mapping. The URL mapping contains only the public Vercel hostname.
