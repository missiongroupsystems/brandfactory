import type { Metadata } from 'next'

import { LegalPage, Mail } from '@/components/legal'

export const metadata: Metadata = { title: 'Privacy Policy · brand base' }

export default function Page() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          brand base is a social media workspace for brands and their marketing teams, operated by
          Mission Group, to plan and publish each brand&rsquo;s social media posts. This page says
          what it keeps, why, and where.
        </p>
      </section>
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>For each person with an account: their email address and name, to sign them in.</li>
          <li>
            For each brand: its content, such as posts, captions, pictures and videos, ideas, shoots
            and the brand kit.
          </li>
          <li>
            For each social account, once it is connected: its account id, display name and profile
            picture, and its access tokens, which are kept encrypted.
          </li>
        </ul>
      </section>
      <section>
        <h2>Why</h2>
        <p>
          Only to plan posts and to publish them on the brand&rsquo;s behalf, and to show the team
          how they did. We do not sell any of it, and we do not use it for advertising.
        </p>
      </section>
      <section>
        <h2>Where</h2>
        <p>
          Sign-in, brand data and files are kept with Supabase, in Singapore. The app&rsquo;s server
          runs on Fly.io, in Singapore.
        </p>
      </section>
      <section>
        <h2>Connected accounts</h2>
        <p>
          A connected account can be disconnected at any time in Connections. Disconnecting it
          deletes what brand base keeps for it (its id, display name, profile picture and access
          tokens), so brand base can no longer use it.
        </p>
        <p>
          For TikTok, brand base keeps the account&rsquo;s id, display name, profile picture and
          access tokens, and for each video sent to the inbox, how the send went and TikTok&rsquo;s
          reference for it. Those send records stay with the post until the post or the brand is
          deleted, or until you ask us to delete them. It uses them to show which account is
          connected, to send a video to the account&rsquo;s TikTok inbox as a draft, and to read the
          account&rsquo;s public videos and their views, likes, comments and shares, which it shows
          to the team on the Feed. It reads the videos from TikTok each time the Feed shows them and
          does not store them. The only content it sends to TikTok is the video a person on the team
          chooses to send. It does not post to TikTok.
        </p>
        <p>
          The TikTok access tokens are kept, encrypted, while the account is connected, and renewed
          before they expire for as long as TikTok allows. Disconnecting the account asks TikTok to
          withdraw brand base&rsquo;s access, and brand base deletes its copy of the tokens either
          way. If your TikTok account was connected to brand base and you are not on the team that
          connected it, write to <Mail /> and we delete what we keep for it.
        </p>
      </section>
      <section id="facebook-and-instagram">
        <h2>Facebook and Instagram</h2>
        <p>
          A brand&rsquo;s owner or admin connects its Facebook Page, and the Instagram account
          linked to it, by signing in with Facebook. brand base keeps the Page&rsquo;s id and name,
          the Instagram account&rsquo;s id and username, and the Page&rsquo;s access token, which is
          kept encrypted. It does not keep the person&rsquo;s own Facebook token or profile.
        </p>
        <p>
          It uses them only to publish the posts, Reels and stories a person on the team approves,
          at the time they choose, and to show the team the comments and messages people send the
          brand&rsquo;s Page and Instagram account, so the team can answer them. It keeps each
          comment and message (its words, the sender&rsquo;s name or username, when it came, and the
          ids an answer needs) with the brand, and sends only the answer a person on the team
          writes; it hides a comment only when a person asks.
        </p>
        <p>
          To delete what brand base keeps from Facebook and Instagram, disconnect Facebook in
          Connections: the Page, the Instagram account, the token, and the comments and messages
          that came through them are deleted at once, and the Page stops sending brand base new
          ones. Removing brand base in Facebook&rsquo;s settings (Settings &amp; privacy, Business
          integrations) stops its access. If your Page was connected and you are not on the team
          that connected it, write to <Mail /> and we delete what we keep for it within 30 days.
        </p>
      </section>
      <section>
        <h2>How long</h2>
        <p>
          We keep a brand&rsquo;s content while its team uses brand base for that brand, and a
          person&rsquo;s account while they use it. When either ends, we delete it on request, or
          when it is no longer needed.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          To ask what we keep about you, or to have it corrected or deleted: <Mail />.
        </p>
      </section>
    </LegalPage>
  )
}
