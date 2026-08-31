export type Example = {
  id: string;
  name: string;
  engine: "mermaid" | "plantuml";
  umlType: string;
  source: string;
};

export const examples: Example[] = [
  {
    id: "usecase",
    name: "用例图",
    engine: "plantuml",
    umlType: "use case",
    source: `@startuml
actor User
usecase "Login" as Login
usecase "Place Order" as Order
User --> Login
User --> Order
@enduml`
  },
  {
    id: "class",
    name: "类图",
    engine: "plantuml",
    umlType: "class",
    source: `@startuml
class User {
  +id: int
  +name: string
}
class Order {
  +items: string[]
}
User "1" --> "*" Order : places
@enduml`
  },
  {
    id: "sequence",
    name: "时序图",
    engine: "plantuml",
    umlType: "sequence",
    source: `@startuml
Alice -> Bob: request
Bob --> Alice: response
@enduml`
  },
  {
    id: "activity",
    name: "活动图",
    engine: "plantuml",
    umlType: "activity",
    source: `@startuml
start
if (valid?) then (yes)
  :process;
else (no)
  :reject;
endif
stop
@enduml`
  },
  {
    id: "state",
    name: "状态图",
    engine: "plantuml",
    umlType: "state",
    source: `@startuml
[*] --> Idle
Idle --> Running : start
Running --> Idle : stop
Running --> [*] : finish
@enduml`
  },
  {
    id: "component",
    name: "组件图",
    engine: "plantuml",
    umlType: "component",
    source: `@startuml
component "Web App" as web
component "Database" as db
web --> db
@enduml`
  },
  {
    id: "deployment",
    name: "部署图",
    engine: "plantuml",
    umlType: "deployment",
    source: `@startuml
node "Web Server" {
  component "App"
}
node "DB Server" {
  database "Postgres"
}
"App" --> "Postgres"
@enduml`
  },
  {
    id: "flowchart",
    name: "流程图（正交）",
    engine: "mermaid",
    umlType: "flowchart",
    source: `flowchart LR
  A[开始] --> B{判断}
  B -->|是| C[处理 A]
  B -->|否| D[处理 B]
  C --> E[结束]
  D --> E
  A --> E`
  },
  {
    id: "mermaid-sequence",
    name: "时序图（Mermaid）",
    engine: "mermaid",
    umlType: "sequence",
    source: `sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi`
  },
  {
    id: "mermaid-class",
    name: "类图（Mermaid）",
    engine: "mermaid",
    umlType: "class",
    source: `classDiagram
  Animal <|-- Duck
  Animal <|-- Fish
  Animal : +int age
  Animal : +String gender`
  }
];
