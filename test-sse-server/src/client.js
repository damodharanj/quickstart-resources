import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Anthropic } from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import readline from "readline/promises";
import { url } from "inspector";

const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

dotenv.config(); // load environment variables from .env

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const clients = [
//   {
//   name: 'langraph-client',
//   version: '1.0.0',
//   capabilities: {},
//   url: 'https://gitmcp.io/langchain-ai/langgraph',
// }, 
{
  name: 'test-client',
  version: '1.0.0',
  capabilities: {},
  url: 'http://localhost:3000/sse',
}
];

let tools = [];
let resources = [];
let prompts = [];

for (const client of clients) {
  const transport = new SSEClientTransport(new URL(client.url));
  const mcpClient = new Client({
    name: client.name,
    version: client.version,
  }, {
    capabilities: client.capabilities,
  });
  await mcpClient.connect(transport);
  const toolList = await mcpClient.listTools();
  resources = [...resources, ...(await mcpClient.listResources()).resources] ;
  prompts = [...prompts, ...(await mcpClient.listPrompts()).prompts];
  tools = [...tools, ...toolList.tools.map((tool) => {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    };
  })];

  client.instance = mcpClient; // store the client instance
}

console.log(resources, prompts)

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

const messages = [
    {
      role: "user",
      content: `You are a helpful assistant that can interact with various tools provided by registered clients. 
      You have following resources available: ${JSON.stringify(resources)}.
      You have following prompts available: ${JSON.stringify(prompts)}.
      You have following tools available: ${JSON.stringify(tools)}.
      `,
    }
]

while(1) {
  const query = await rl.question("\nQuery: ");

  messages.push(
    {
      role: "user",
      content: query,
    }
  );

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    messages
  });

  console.log("Response:", response.content.map((msg) => msg.text).join("\n"));

  messages.push(
    {
      role: "assistant",
      content: response.content.map((msg) => msg.text).join("\n"),
    }
  );

  const retTools = response.content.filter((message) => message.type === "tool_use")
    .forEach((toolUse) => {
        // get the client instance from clients array
        const client = clients.find(c => c.name === toolUse.client_name);
        if (!client) {
          console.error(`Client ${toolUse.client_name} not found in registered clients.`);
          return;
        }
        client.mcpClient.callTool({
          name: toolUse.tool_name,
          input: toolUse.input,
        }).then((result) => {
          console.log(`Tool ${toolUse.tool_name} from client ${client.name} returned:`, result);
        }).catch((error) => {
          console.error(`Error calling tool ${toolUse.tool_name} from client ${client.name}:`, error);
        });
    });
  
}

