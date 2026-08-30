import { Workbench } from "@/components/workbench";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  return <Workbench projectId={id} />;
}
