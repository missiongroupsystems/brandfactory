import type { Metadata } from 'next'

import { LegalPage, Mail } from '@/components/legal'

export const metadata: Metadata = { title: 'Privacy Policy · brand base' }

export default function Page() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          brand base is an internal tool operated by Mission Group for its own staff, to plan and
          publish social media posts for Mission Group&rsquo;s brands. This page says what it keeps,
          why, and where.
        </p>
      </section>
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>For each member of staff: their email address and name, to sign them in.</li>
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
          Sign-in and files are kept with Supabase, in Singapore. The rest is kept in a database on
          Fly.io, in Singapore.
        </p>
      </section>
      <section>
        <h2>Connected accounts</h2>
        <p>
          A connected account can be disconnected at any time in Connections. Disconnecting it
          deletes its access tokens, so brand base can no longer read from it or publish to it.
        </p>
      </section>
      <section>
        <h2>How long</h2>
        <p>
          We keep a brand&rsquo;s content while Mission Group uses brand base for that brand, and a
          staff account while the person works with it. When either ends, we delete it on request,
          or when it is no longer needed.
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
