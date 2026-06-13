type HeaderWriter = {
  setHeader(name: string, value: string): void
}

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
  "font-src 'self' https://fonts.gstatic.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src https://hcaptcha.com https://*.hcaptcha.com",
  "img-src 'self' data: https:",
  "object-src 'none'",
  "script-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://hcaptcha.com https://*.hcaptcha.com",
  'upgrade-insecure-requests',
].join('; ')

export function applySecurityHeaders(res: HeaderWriter): void {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
}
