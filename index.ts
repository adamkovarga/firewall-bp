type NodeType =
  | "source_ip"
  | "destination_ip"
  | "source_port"
  | "destination_port"
  | "protocol"
  | "action";
type Node<SOURCE_DOMAIN extends Domain, TARGET_DOMAIN extends Domain> =
  | NonTerminalNode<SOURCE_DOMAIN, TARGET_DOMAIN>
  | TerminalNode<SOURCE_DOMAIN>;

class ValueNotAvailableError extends Error {
  node: Node<Domain, Domain>;
  value: string | number;
  constructor(node: Node<Domain, Domain>, value: string | number) {
    super(`Value ${value} is not available in node domain ${node.type}`);
    this.node = node;
    this.value = value;
  }
}

abstract class Domain {
  availableValuesSet: Set<number>;
  start: string | number | undefined;
  end: string | number | undefined;
  abstract createRangeSet(
    startOrRange: string | number | string[],
    end?: string | number,
  ): void;
  abstract getDomainValue(value: string | number): number;
  abstract getRangeValue(value: string | number): string;

  constructor(startOrRange: string | number | string[], end?: string | number) {
    this.availableValuesSet = new Set();
    if (Array.isArray(startOrRange)) {
      this.createRangeSet(startOrRange);
      return;
    }
    this.start = startOrRange;
    this.end = end;
    this.createRangeSet(startOrRange, end);
  }

  has(value: number): boolean {
    return this.availableValuesSet.has(value);
  }

  add(value: number) {
    this.availableValuesSet.add(value);
  }

  delete(value: number) {
    this.availableValuesSet.delete(value);
  }
}
class IpRange extends Domain {
  createRangeSet(start: string, end: string) {
    this.start = start;
    this.end = end;
    for (
      let i = this.getDomainValue(start);
      i <= this.getDomainValue(end);
      i++
    ) {
      this.add(i);
    }
  }

  getDomainValue(value: string): number {
    return (
      value.split(".").reduce((acc, octet) => {
        return (acc << 8) + parseInt(octet, 10);
      }, 0) >>> 0
    );
  }

  getRangeValue(value: number): string {
    return [
      (value >> 24) & 255,
      (value >> 16) & 255,
      (value >> 8) & 255,
      value & 255,
    ].join(".");
  }
}
class PortRange extends Domain {
  constructor(start: number, end: number) {
    super(start, end);
  }
  createRangeSet(start: number, end: number) {
    for (let i = start; i <= end; i++) {
      this.add(i);
    }
  }

  getDomainValue(value: string): number {
    return parseInt(value);
  }
  getRangeValue(value: number): string {
    return value.toString();
  }
}
class Protocol extends Domain {
  static protocolList: string[] = ["tcp", "udp", "icmp"];
  constructor() {
    super(Protocol.protocolList);
  }
  createRangeSet(protocolList: string[]) {
    for (const protocol of protocolList) {
      this.add(this.getDomainValue(protocol));
    }
  }
  getDomainValue(value: string): number {
    return Protocol.protocolList.indexOf(value);
  }
  getRangeValue(value: number): string {
    return Protocol.protocolList[value];
  }
}
class Action extends Domain {
  static actionList: string[] = ["allow", "discard"];
  constructor() {
    super(Action.actionList);
  }
  createRangeSet(actionList: string[]) {
    for (const action of actionList) {
      this.add(this.getDomainValue(action));
    }
  }
  getDomainValue(value: string): number {
    return Action.actionList.indexOf(value);
  }
  getRangeValue(value: number): string {
    return Action.actionList[value];
  }
}

class Edge<SOURCE_DOMAIN extends Domain, TARGET_DOMAIN extends Domain> {
  source: Node<SOURCE_DOMAIN, TARGET_DOMAIN>;
  target: Node<TARGET_DOMAIN, Domain>;
  value: string;
  constructor(
    source: Node<SOURCE_DOMAIN, TARGET_DOMAIN>,
    target: Node<TARGET_DOMAIN, Domain>,
    value: string,
  ) {
    this.source = source;
    this.target = target;
    this.value = value;
  }
}

abstract class NonTerminalNode<
  SOURCE_DOMAIN extends Domain,
  TARGET_DOMAIN extends Domain,
> {
  type: NodeType; // F(v)
  domain: SOURCE_DOMAIN; // D(F(v))
  edges: Edge<SOURCE_DOMAIN, TARGET_DOMAIN>[] = [];

  constructor(type: NodeType, domain: SOURCE_DOMAIN) {
    this.type = type;
    this.domain = domain;
  }

  addEdge(edge: Edge<SOURCE_DOMAIN, TARGET_DOMAIN>) {
    const { value } = edge;
    if (!this.domain.has(this.domain.getDomainValue(value))) {
      throw new ValueNotAvailableError(this, value);
    }
    this.domain.delete(this.domain.getDomainValue(value));
    this.edges.push(edge);
  }

  // validate(packet: Packet) {
  //   const value = packet[this.type];
  //   if (value === undefined) {
  //     throw new Error(
  //       `Packet ${packet} does not have value for type ${this.type}`,
  //     );
  //   }
  //   for (const edge of this.edges) {
  //     const { target } = edge;
  //     if (target) {
  //     }
  //   }
  // }
}

abstract class TerminalNode<DOMAIN extends Domain> {
  type: NodeType;
  domain: DOMAIN;
  value: string | number;
  constructor(type: NodeType, domain: DOMAIN, value: string | number) {
    this.type = type;
    this.domain = domain;
    this.value = value;
  }
}

// SourceIp -> DestinationIp -> SourcePort -> DestinationPort -> Protocol -> Action

class SourceIpNode extends NonTerminalNode<IpRange, IpRange> {
  constructor(type: "source_ip", domain: IpRange) {
    super(type, domain);
  }
}
class DestinationIpNode extends NonTerminalNode<IpRange, PortRange> {
  constructor(type: "destination_ip", domain: IpRange) {
    super(type, domain);
  }
}
class SourcePortNode extends NonTerminalNode<PortRange, PortRange> {
  constructor(type: "source_port", domain: PortRange) {
    super(type, domain);
  }
}
class DestinationPortNode extends NonTerminalNode<PortRange, Protocol> {
  constructor(type: "destination_port", domain: PortRange) {
    super(type, domain);
  }
}
class ProtocolNode extends NonTerminalNode<Protocol, Action> {
  constructor(type: "protocol") {
    super(type, new Protocol());
  }
}
class ActionNode extends TerminalNode<Action> {
  constructor(type: "action", value: "accept" | "discard") {
    super(type, new Action(), value);
  }
}

// public ip range
const sourceIpRange = new IpRange("109.230.37.1", "109.230.37.10");
const sourceIpNode = new SourceIpNode("source_ip", sourceIpRange);

const targetIpRange = new IpRange("192.168.1.1", "192.168.1.255");
const targetIpNode = new DestinationIpNode("destination_ip", targetIpRange);

const sourcePortRange = new PortRange(1, 65535);
const sourcePortNode = new SourcePortNode("source_port", sourcePortRange);

const destinationPortRange = new PortRange(1, 65535);
const destinationPortNode = new DestinationPortNode(
  "destination_port",
  destinationPortRange,
);

const tcpProtocolNode = new ProtocolNode("protocol");
const allowActionNode = new ActionNode("action", "accept");
const discardActionNode = new ActionNode("action", "discard");

// public ip 109.230.37.1 is allowed for private ip 192.168.1.10
// port 80 is open
sourceIpNode.addEdge(new Edge(sourceIpNode, targetIpNode, "109.230.37.1"));
targetIpNode.addEdge(new Edge(targetIpNode, sourcePortNode, "192.168.1.10"));
sourcePortNode.addEdge(new Edge(sourcePortNode, destinationPortNode, "80"));
destinationPortNode.addEdge(
  new Edge(destinationPortNode, tcpProtocolNode, "80"),
);
tcpProtocolNode.addEdge(new Edge(tcpProtocolNode, allowActionNode, "tcp"));

// duplicate edge for testing
// public ip 109.230.37.1 is allowed for private ip 192.168.1.10
// port 22 is closed
sourceIpNode.addEdge(new Edge(sourceIpNode, targetIpNode, "109.230.37.1"));
targetIpNode.addEdge(new Edge(targetIpNode, sourcePortNode, "192.168.1.10"));
sourcePortNode.addEdge(new Edge(sourcePortNode, destinationPortNode, "22"));
destinationPortNode.addEdge(
  new Edge(destinationPortNode, tcpProtocolNode, "22"),
);
tcpProtocolNode.addEdge(new Edge(tcpProtocolNode, discardActionNode, "tcp"));
