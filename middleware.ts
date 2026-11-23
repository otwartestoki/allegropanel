// middleware.ts

import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const basicAuth = request.headers.get("authorization");

  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return new NextResponse("Brak konfiguracji dostępu.", { status: 503 });
  }

  if (basicAuth?.startsWith("Basic ")) {
    try {
    const authValue = basicAuth.split(" ")[1];
    const decoded = atob(authValue);
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);

    if (user === username && pass === password) {
      return NextResponse.next();
    }
    } catch {
      // Malformed credentials receive the same authentication challenge.
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
