// The bridge between the two editors: AST -> Drawflow graph -> AST.
// What must hold is that a round trip through the canvas does not change the
// program, because that is what keeps the two editors showing the same thing.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAst } from "../lang/ast.js";
import { astToGraph, graphToAst, layoutOf, parseConditionText } from "../lang/graph.js";
import { printProgram } from "../lang/print.js";

const print = (ast) => printProgram(ast).text;
const nodesOf = (graph) => Object.values(graph.drawflow.Home.data);
const roundTrip = (source) => print(graphToAst(astToGraph(buildAst(source))));

// --- round trips ------------------------------------------------------------

test("a sequence of calls survives the canvas", () => {
  const source = "RUN  Calibrate_Sensor()\nRUN  Fan_Off()";
  assert.equal(roundTrip(source), source);
});

test("an order-based chain survives the canvas", () => {
  const source = "RUN  AT_Boar.Read_Temp(C)\nTHEN AT_Boar.Fan_On(60)\nTHEN AT_Boar.Fan_Off()";
  assert.equal(roundTrip(source), source);
});

test("a condition with both branches survives the canvas", () => {
  const source = [
    "IF   Read_Temp(C) > 28 AND Read_Humidity() > 60",
    "DO",
    "     Fan_On(75)",
    "     Set_Window(50)",
    "ELSE",
    "     Window_Close()",
    "END",
  ].join("\n");
  assert.equal(roundTrip(source), source);
});

test("the Lab 4 demo app survives the canvas", () => {
  const source = [
    "RUN  AT_BoarAirSensor.Calibrate_Sensor()",
    "THEN AT_BoarAirSensor.Read_Temp(C)",
    "IF   AT_BoarAirSensor.Read_Temp(C) > 24 AND AT_BoarAirSensor.Read_Humidity() > 45",
    "DO",
    "     AT_BoarAirSensor.Fan_On(60)",
    "     AT_BoarAirSensor.Set_Window(40)",
    "ELSE",
    "     AT_BoarAirSensor.Fan_Off()",
    "END",
    "RUN  AT_BoarAirSensor.Read_Window_Position()",
  ].join("\n");
  assert.equal(roundTrip(source), source);
});

test("nested conditions and a loop survive the canvas", () => {
  const source = [
    "LOOP EVERY 10s",
    "     IF   Read_Temp(C) > 28",
    "     DO",
    "          IF   Read_Fan_Status() == 0",
    "          DO",
    "               Fan_On(75)",
    "          END",
    "     ELSE",
    "          Fan_Off()",
    "     END",
    "END",
  ].join("\n");
  assert.equal(roundTrip(source), source);
});

test("an empty program gives just the start block", () => {
  const graph = astToGraph(buildAst(""));
  assert.deepEqual(nodesOf(graph).map((node) => node.name), ["start"]);
  assert.deepEqual(graphToAst(graph), { kind: "program", body: [] });
});

// --- the shape of the graph -------------------------------------------------

test("every call becomes one block, and the chain uses the ok port", () => {
  const graph = astToGraph(buildAst("RUN Read_Temp(C)\nTHEN Fan_On(60)"));
  const [start, first, second] = nodesOf(graph);

  assert.equal(start.name, "start");
  assert.equal(first.data.service, "Read_Temp");
  assert.equal(first.data.arg0, "C");
  assert.equal(second.data.service, "Fan_On");

  // start --next--> Read_Temp --ok--> Fan_On
  assert.deepEqual(start.outputs.output_1.connections, [{ node: "2", output: "input_1" }]);
  assert.deepEqual(first.outputs.output_1.connections, [], "next must stay free in a THEN chain");
  assert.deepEqual(first.outputs.output_2.connections, [{ node: "3", output: "input_1" }]);
  assert.deepEqual(second.inputs.input_1.connections, [{ node: "2", input: "output_2" }]);
});

test("a condition block wires then, else and next", () => {
  const graph = astToGraph(
    buildAst("IF Read_Temp(C) > 28\nDO Fan_On(75)\nELSE Fan_Off()\nEND\nRUN Window_Close()"),
  );
  const condition = nodesOf(graph).find((node) => node.name === "condition");

  assert.equal(condition.data.condition, "Read_Temp(C) > 28");
  assert.equal(condition.outputs.output_1.connections.length, 1, "then");
  assert.equal(condition.outputs.output_2.connections.length, 1, "else");
  assert.equal(condition.outputs.output_3.connections.length, 1, "next");
});

test("blocks carry their AST id, so the text and the canvas can find each other", () => {
  const ast = buildAst("RUN Fan_On(75)");
  const graph = astToGraph(ast);
  const service = nodesOf(graph).find((node) => node.name === "service");

  assert.equal(service.data.astId, ast.body[0].calls[0].id);
});

// --- layout -----------------------------------------------------------------

test("stored positions are used, and new blocks are laid out automatically", () => {
  const ast = buildAst("RUN Fan_On(75)\nRUN Fan_Off()");
  const id = ast.body[0].calls[0].id;

  const graph = astToGraph(ast, { layout: { [id]: { x: 999, y: 111 } } });
  const nodes = nodesOf(graph);

  assert.deepEqual([nodes[1].pos_x, nodes[1].pos_y], [999, 111]);
  assert.notDeepEqual([nodes[2].pos_x, nodes[2].pos_y], [999, 111]);
});

test("the layout can be read back out of the graph", () => {
  const ast = buildAst("RUN Fan_On(75)");
  const id = ast.body[0].calls[0].id;
  const layout = layoutOf(astToGraph(ast, { layout: { [id]: { x: 12, y: 34 } } }));

  assert.deepEqual(layout[id], { x: 12, y: 34 });
});

// --- robustness -------------------------------------------------------------

test("a block nothing reaches is left out of the program", () => {
  const graph = astToGraph(buildAst("RUN Fan_On(75)"));
  // Add an orphan the start block does not lead to.
  graph.drawflow.Home.data[99] = {
    id: 99,
    name: "service",
    data: { astId: "c:orphan#0", thing: "", service: "Window_Close" },
    inputs: { input_1: { connections: [] } },
    outputs: { output_1: { connections: [] }, output_2: { connections: [] } },
    pos_x: 0,
    pos_y: 0,
  };

  assert.equal(print(graphToAst(graph)), "RUN  Fan_On(75)");
});

test("a cycle on the canvas does not hang the conversion", () => {
  const graph = astToGraph(buildAst("RUN Fan_On(75)\nRUN Fan_Off()"));
  const nodes = graph.drawflow.Home.data;
  // Point the last block back at the first.
  nodes[3].outputs.output_1.connections.push({ node: "2", output: "input_1" });

  assert.equal(print(graphToAst(graph)), "RUN  Fan_On(75)\nRUN  Fan_Off()");
});

test("a graph with no start block gives an empty program", () => {
  assert.deepEqual(graphToAst({ drawflow: { Home: { data: {} } } }), { kind: "program", body: [] });
  assert.deepEqual(graphToAst(null), { kind: "program", body: [] });
});

test("a condition block's text is parsed with the same grammar", () => {
  const test1 = parseConditionText("Read_Temp(C) > 28 AND Read_Humidity() > 60");
  assert.equal(test1.terms.length, 1);
  assert.equal(test1.terms[0].terms.length, 2);

  // Nonsense gives an empty condition rather than throwing; validation reports it.
  assert.deepEqual(parseConditionText("%%%"), { kind: "or", terms: [] });
});
