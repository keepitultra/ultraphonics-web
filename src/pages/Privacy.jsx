export default function Privacy() {
  return (
    <main style={{ position: 'relative' }}>
      <div className="page-header services-page-header">
        <h1 className="page-title">Privacy & Cookies</h1>
        <p className="page-lead">
          This page explains what we collect on ultraphonicsmusic.com and why.
        </p>
      </div>

      <div className="privacy-content">
        <h2>Analytics cookies</h2>
        <p>
          With your consent, we use Google Analytics to understand how visitors use this site
          (pages viewed, general location, device type). Google Analytics sets cookies to do this.
          You can decline analytics cookies in the consent banner, or change your choice at any
          time by clearing your browser's site data for this domain.
        </p>

        <h2>Other data we handle</h2>
        <p>
          Forms on this site (contact, quote requests, song requests) send the information you
          submit to us via EmailJS and/or store it in our Firebase database so we can respond to
          your request. We don't sell your data.
        </p>

        <h2>Questions</h2>
        <p>
          Reach out via our <a href="/contact">contact page</a> with any privacy questions.
        </p>
      </div>
    </main>
  );
}
