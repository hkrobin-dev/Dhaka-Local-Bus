import RouteResults from '@/Screens/RouteResults';

// Typed locally rather than relying on Next's generated PageProps global, so
// `tsc --noEmit` works on a clean checkout before the first build.
type Params = { params: Promise<{ fromId: string; toId: string }> };

export default async function Page({ params }: Params) {
  const { fromId, toId } = await params;
  return <RouteResults fromId={fromId} toId={toId} />;
}
