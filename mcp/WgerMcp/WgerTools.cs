using System.ComponentModel;
using System.Text;
using ModelContextProtocol.Server;

namespace WgerMcp;

/// <summary>MCP tools exposed to Claude Code. Results are compact Markdown so agents can cite them directly.</summary>
[McpServerToolType]
public sealed class WgerTools(WgerClient wger)
{
    [McpServerTool(Name = "list_equipment", ReadOnly = true)]
    [Description("List all equipment types known to the wger exercise database, with their ids.")]
    public async Task<string> ListEquipment(CancellationToken ct)
    {
        var items = await wger.GetEquipmentAsync(ct);
        return Table("Equipment", items.Select(i => (i.Id, i.Name)));
    }

    [McpServerTool(Name = "list_categories", ReadOnly = true)]
    [Description("List exercise categories (body areas such as Legs, Chest, Back, Cardio) with their ids.")]
    public async Task<string> ListCategories(CancellationToken ct)
    {
        var items = await wger.GetCategoriesAsync(ct);
        return Table("Categories", items.Select(i => (i.Id, i.Name)));
    }

    [McpServerTool(Name = "list_muscles", ReadOnly = true)]
    [Description("List muscles with their ids (Latin name and common English name).")]
    public async Task<string> ListMuscles(CancellationToken ct)
    {
        var items = await wger.GetMusclesAsync(ct);
        return Table("Muscles", items.Select(m => (m.Id, string.IsNullOrEmpty(m.NameEn) ? m.Name : $"{m.Name} ({m.NameEn})")));
    }

    [McpServerTool(Name = "search_exercises", ReadOnly = true)]
    [Description("Search exercises in the wger database. Filter by category id, equipment id and/or muscle id " +
                 "(get ids from list_categories / list_equipment / list_muscles), optionally by a name substring. " +
                 "Returns id, name, category, primary/secondary muscles, equipment and a public source URL.")]
    public async Task<string> SearchExercises(
        [Description("Category id, e.g. 9 = Legs")] int? categoryId = null,
        [Description("Equipment id, e.g. 7 = bodyweight, 3 = Dumbbell")] int? equipmentId = null,
        [Description("Primary muscle id")] int? muscleId = null,
        [Description("Optional case-insensitive substring of the exercise name")] string? nameContains = null,
        [Description("Max results to return (1-50)")] int maxResults = 20,
        CancellationToken ct = default)
    {
        maxResults = Math.Clamp(maxResults, 1, 50);
        // Name filtering is client-side (the public API has no reliable search endpoint), so fetch a wider page.
        var fetch = nameContains is null ? maxResults : 200;
        var all = await wger.GetExercisesAsync(categoryId, equipmentId, muscleId, fetch, ct);

        var rows = all
            .Select(e => (Exercise: e, En: WgerClient.English(e)))
            .Where(x => x.En is not null)
            .Where(x => nameContains is null || x.En!.Name.Contains(nameContains, StringComparison.OrdinalIgnoreCase))
            .Take(maxResults)
            .ToList();

        if (rows.Count == 0) return "No exercises matched the filters.";

        var sb = new StringBuilder("| id | name | category | primary muscles | secondary muscles | equipment | source |\n|---|---|---|---|---|---|---|\n");
        foreach (var (e, en) in rows)
        {
            sb.Append($"| {e.Id} | {en!.Name} | {e.Category.Name} | {Muscles(e.Muscles)} | {Muscles(e.MusclesSecondary)} | " +
                      $"{string.Join(", ", e.Equipment.Select(q => q.Name))} | {WgerClient.PublicUrl(e.Id)} |\n");
        }
        return sb.ToString();
    }

    [McpServerTool(Name = "get_exercise", ReadOnly = true)]
    [Description("Get full details of one exercise by id, including the English execution instructions and source URL.")]
    public async Task<string> GetExercise([Description("Exercise id from search_exercises")] int id, CancellationToken ct)
    {
        var e = await wger.GetExerciseAsync(id, ct);
        if (e is null) return $"Exercise {id} not found.";
        var en = WgerClient.English(e);
        return $"""
            ## {en?.Name ?? $"Exercise {id}"}
            - id: {e.Id}
            - category: {e.Category.Name}
            - primary muscles: {Muscles(e.Muscles)}
            - secondary muscles: {Muscles(e.MusclesSecondary)}
            - equipment: {string.Join(", ", e.Equipment.Select(q => q.Name))}
            - source: {WgerClient.PublicUrl(e.Id)}

            {(en is null ? "No English description available." : WgerClient.StripHtml(en.Description))}
            """;
    }

    private static string Muscles(IEnumerable<Muscle> muscles) =>
        string.Join(", ", muscles.Select(m => string.IsNullOrEmpty(m.NameEn) ? m.Name : m.NameEn));

    private static string Table(string title, IEnumerable<(int Id, string Name)> rows) =>
        $"| id | {title} |\n|---|---|\n" + string.Join('\n', rows.Select(r => $"| {r.Id} | {r.Name} |"));
}
