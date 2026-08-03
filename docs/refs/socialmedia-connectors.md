## Overview

Most production-quality tools in this space are built on the **Model Context Protocol (MCP)**, an open standard from Anthropic that lets AI agents (Claude, GPT, Cursor, etc.) call external tools directly. For marketing performance monitoring specifically — Instagram, Facebook/Meta Business Suite, and TikTok — several open-source MCP servers stand out for maturity, tool depth, and setup quality. This report ranks the strongest options by platform and use case.[1]

## Instagram & Meta Business Suite

Meta Business Suite exposes Instagram data through the **Instagram Graph API** and **Facebook Graph API**, so any repo that wraps these APIs effectively gives your agents access to both. Three repos are worth evaluating:

| Repo | Stars | Tooling depth | Notes |
|---|---|---|---|
| `mikusnuz/meta-mcp` | Newer, actively developed | 57 tools: 33 Instagram, 18 Threads, plus Meta platform management | Broadest single-repo coverage of the Meta ecosystem, including Threads[1] |
| `mcpware/instagram-mcp` (fork of `jlbadano/ig-mcp`) | 12 stars, active commits through mid-2026 | 23 tools covering profile/account insights, media, comments, DMs, hashtag/discovery | Strong documentation (step-by-step Meta App setup, token refresh strategy, troubleshooting table), typed CI/CD pipeline, pytest coverage, Docker support — signals genuine engineering rigor rather than a weekend project[2][3] |
| `HagaiHen/facebook-mcp-server` | 35 stars, 14 forks | 28 tools: posting, comment moderation, sentiment filtering, and a full analytics suite (impressions, reach, engagement, reactions breakdown, top commenters, share count) | Best-documented Facebook Page insights tool; MIT licensed, clean README, ready for Claude Desktop[4] |

For your use case — monitoring IG/FB **post performance** — `mcpware/instagram-mcp` is the standout for Instagram specifically. It ships dedicated `get_media_insights` and `get_account_insights` tools, built-in rate-limit handling (200 calls/hour, 25 posts/day), and pre-built prompts for "Analyze Engagement" and "Hashtag Analysis" that map directly to a marketing monitoring workflow. Pair it with `HagaiHen/facebook-mcp-server` if you also need Facebook Page-level metrics (fan count, impressions breakdown, reactions).[4][3]

## TikTok

TikTok tooling is more fragmented — some repos target organic analytics, others target TikTok Ads, and several rely on third-party scraping APIs rather than TikTok's own Developer API. The most relevant for monitoring organic post/video performance:

| Repo | Data source | Fit for marketing monitoring |
|---|---|---|
| `lanternrow/tiktok-organic-mcp` | TikTok Developer API (official, requires `TIKTOK_CLIENT_KEY` + `TIKTOK_ACCESS_TOKEN`) | Purpose-built for organic analytics — video performance, engagement metrics, follower stats. Notably, it fills a real gap: most other open-source TikTok MCPs only cover Ads, not organic content[5] |
| `subzeroid/datalikers-mcp` | DataLikers third-party dataset/cache API | 29 tools spanning both Instagram and TikTok — profiles, engagement, hashtags, demographics. Good for cross-platform benchmarking/competitor tracking, but it's a paid API behind the MCP (from $0.0003/request), not a direct TikTok Developer API integration[6][7] |
| `ysntony/tiktok-ads-mcp` | TikTok Business API | Full interface for TikTok ad campaigns, ad groups, and performance reporting — use this only if paid TikTok Ads reporting is in scope[8] |
| `seym0n/tiktok-mcp` / `terrylinhaochen/tiktok_mcp` | Scraping-based (TikNeuron / Playwright) | Good for virality/content analysis on arbitrary videos (including competitors'), but relies on session cookies or browser automation rather than an owned-account API — less robust for continuous internal monitoring[9][10] |

For an internal marketing team tracking your own brand's TikTok performance, `lanternrow/tiktok-organic-mcp` is the most directly aligned tool since it authenticates against your own TikTok account via the official Developer API rather than scraping.[5]

## Multi-Platform / Unified Options

If you'd rather run one server that spans Instagram, Facebook, TikTok, LinkedIn, X, and YouTube instead of stitching together separate repos, two categories exist:

- **`socialcrawl/mcp`**: Unified read-focused API covering 27 platforms and 133 endpoints (profiles, posts, comments, trending content, analytics) across TikTok, Instagram, YouTube, X, LinkedIn, and more, via a single API key model with 100 free credits.[11]
- **`bundle.social` MCP**: Covers 14+ platforms with both posting/scheduling and analytics pulled as first-class agent tools; official npm package (`bundlesocial-mcp`), OAuth-based account connection, built for agent builders rather than one-off scripts.[12]
- **`langchain-ai/social-media-agent`**: A more workflow-oriented (not MCP) LangGraph agent for sourcing, curating, and scheduling posts to Twitter/LinkedIn with human-in-the-loop review — useful as an architecture reference if your team wants to build a custom monitoring agent rather than adopt an off-the-shelf MCP server.[13]

These unified tools trade some platform-specific depth (e.g., they may lack Instagram Insights' granular metrics like reach-by-follower-type) for lower integration overhead — a reasonable tradeoff if your marketing team wants one dashboard-style agent across all channels rather than platform-specific specialists.

## Recommended Setup for Marketing Performance Monitoring

Given the objective — a marketing team using agents to monitor social performance and post-level metrics — a pragmatic stack is:

- **Instagram + Facebook**: `mcpware/instagram-mcp` for Instagram Business insights and `HagaiHen/facebook-mcp-server` for Facebook Page insights, both authenticated via a long-lived Meta Graph API token tied to your Business Manager account.[3][4]
- **TikTok**: `lanternrow/tiktok-organic-mcp` for owned-account video performance via the official Developer API.[5]
- **Optional roll-up**: `socialcrawl/mcp` or `bundle.social` if the team wants a single cross-platform view alongside the platform-specific servers, particularly for competitor benchmarking.[11][12]

All of these are MCP-standard, meaning they plug directly into Claude Desktop, Claude Code, Cursor, or any MCP-compatible agent runtime with a JSON config block and environment variables for API credentials — no custom integration code required.[4][3][5]

## Setup Considerations

Before rolling this out to the marketing team, note two practical constraints. Meta's Graph API requires the Instagram account to be a Business or Creator account linked to a Facebook Page, with long-lived tokens expiring every 60 days and DM features requiring Meta App Review — factor token-refresh automation into any production deployment. TikTok's official Developer API access for organic analytics is more restrictive than Meta's, so confirm your TikTok app has the necessary API scopes approved before committing to `tiktok-organic-mcp` for production use.[3][5]