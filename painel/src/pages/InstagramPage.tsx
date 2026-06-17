import { useSearchParams } from "react-router-dom";
import { PageShell } from "../components/layout/PageShell";
import { TabPanel, Tabs } from "../components/ui/Tabs";
import { PostagensPage } from "./PostagensPage";
import { AgentesInstagramPage } from "./AgentesInstagramPage";

const TAB_IDS = ["posts", "agente"] as const;
type TabId = (typeof TAB_IDS)[number];

function parseTab(raw: string | null): TabId {
  return raw === "agente" ? "agente" : "posts";
}

export function InstagramPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));

  const setTab = (id: string) => {
    const next = parseTab(id);
    if (next === "posts") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", next);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <PageShell
      wide
      title="Instagram"
      description="Posts publicados e agente de comentário/Direct — tudo do canal Instagram em um lugar."
    >
      <Tabs
        tabs={[
          { id: "posts", label: "Posts" },
          { id: "agente", label: "Agente" },
        ]}
        activeId={activeTab}
        onChange={setTab}
      />
      <TabPanel>
        {activeTab === "posts" ? <PostagensPage embedded /> : <AgentesInstagramPage embedded />}
      </TabPanel>
    </PageShell>
  );
}
