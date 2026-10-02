using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WgerMcp;

// MCP server over stdio. stdout is the protocol channel, so all logging goes to stderr.
var builder = Host.CreateApplicationBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole(o => o.LogToStandardErrorThreshold = LogLevel.Trace);

builder.Services.AddHttpClient<WgerClient>(c =>
{
    c.BaseAddress = new Uri(Environment.GetEnvironmentVariable("WGER_BASE_URL") ?? "https://wger.de/");
    c.Timeout = TimeSpan.FromSeconds(30);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("fitness-program-builder-mcp/1.0");
});

builder.Services
    .AddMcpServer()
    .WithStdioServerTransport()
    .WithTools<WgerTools>();

await builder.Build().RunAsync();
