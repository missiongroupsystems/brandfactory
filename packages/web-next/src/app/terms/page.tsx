import type { Metadata } from 'next'

import { LegalPage, Mail } from '@/components/legal'

export const metadata: Metadata = { title: 'Terms of Service · brand base' }

export default function Page() {
  return (
    <LegalPage title="Terms of Service">
      <section>
        <h2>What brand base is</h2>
        <p>
          brand base is an internal tool operated by Mission Group. Mission Group&rsquo;s staff use
          it to plan, prepare and publish social media posts for Mission Group&rsquo;s own brands.
          It is not offered to the public.
        </p>
      </section>
      <section>
        <h2>Who may use it</h2>
        <p>
          Only people Mission Group has given an account. Keep your password to yourself, and tell
          us if you think someone else has used your account.
        </p>
      </section>
      <section>
        <h2>Connected social accounts</h2>
        <p>
          A brand&rsquo;s Instagram, TikTok, Facebook or other account is connected only by someone
          allowed to manage it. brand base then publishes only what a person on the team has
          scheduled or approved, and, once the account is connected, reads what planning needs from
          it, such as its posts and their counts. You can disconnect an account at any time in
          Connections.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          Posts, pictures, videos and notes belong to Mission Group and its brands. You are
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
        <h2>Contact</h2>
        <p>
          Questions about these terms: <Mail />.
        </p>
      </section>
    </LegalPage>
  )
}
