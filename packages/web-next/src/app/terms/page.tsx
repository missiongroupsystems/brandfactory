import type { Metadata } from 'next'

import { LegalPage, Mail } from '@/components/legal'

export const metadata: Metadata = { title: 'Terms of Service · brand base' }

export default function Page() {
  return (
    <LegalPage title="Terms of Service">
      <section>
        <h2>What brand base is</h2>
        <p>
          brand base is a social media workspace for brands and their marketing teams, operated by
          Mission Group. A team uses it to plan, prepare and publish its brands&rsquo; social media
          posts.
        </p>
      </section>
      <section>
        <h2>Who may use it</h2>
        <p>
          People with an account, using it for a business. You must be 18 or older. To get one for
          your team, write to <Mail />. Keep your password to yourself, and tell us if you think
          someone else has used your account.
        </p>
      </section>
      <section>
        <h2>Connected social accounts</h2>
        <p>
          A brand&rsquo;s Instagram, TikTok, Facebook or other account is connected only by someone
          allowed to manage it. Except on TikTok (below), brand base then publishes only what a
          person on the team has scheduled or approved, and, once the account is connected, reads
          what planning needs from it, such as its posts and their counts. You can disconnect an
          account at any time in Connections.
        </p>
        <p>
          For TikTok, brand base sends a video to the connected account&rsquo;s TikTok inbox as a
          draft, shows the account&rsquo;s name and picture, and shows the account&rsquo;s public
          videos and their counts on the Feed. It does not post to TikTok. The creator finishes and
          posts the draft in the TikTok app.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          Posts, pictures, videos and notes belong to the brand they are made for. You are
          responsible for what you publish, and for following each platform&rsquo;s own rules.
        </p>
      </section>
      <section>
        <h2>The service</h2>
        <p>
          We work to keep brand base running and correct, but it is provided as it is, and a post
          can fail to go out. We may change or stop the service, and we may close an account that is
          no longer needed.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          As far as the law allows, Mission Group is not liable for indirect or consequential
          losses, or for a post that goes out late or not at all.
        </p>
      </section>
      <section>
        <h2>Changes and law</h2>
        <p>
          We may update these terms. The date at the top shows the latest version, and we tell
          account holders by email about any important change. These terms are governed by the laws
          of Singapore.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms: <Mail />.
        </p>
      </section>
    </LegalPage>
  )
}
