export class NextResponse extends Response {
  static next() {
    return new Response(null);
  }

  static redirect(url: string | URL) {
    return Response.redirect(url.toString());
  }
}
