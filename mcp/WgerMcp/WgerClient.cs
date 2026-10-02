using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace WgerMcp;

/// <summary>Thin typed client over the public wger REST API (https://wger.de/api/v2/). No key required.</summary>
public sealed partial class WgerClient(HttpClient http)
{
    private const int EnglishLanguageId = 2;

    public async Task<IReadOnlyList<NamedRef>> GetEquipmentAsync(CancellationToken ct) =>
        (await http.GetFromJsonAsync<Page<NamedRef>>("api/v2/equipment/?limit=100", ct))!.Results;

    public async Task<IReadOnlyList<NamedRef>> GetCategoriesAsync(CancellationToken ct) =>
        (await http.GetFromJsonAsync<Page<NamedRef>>("api/v2/exercisecategory/?limit=100", ct))!.Results;

    public async Task<IReadOnlyList<Muscle>> GetMusclesAsync(CancellationToken ct) =>
        (await http.GetFromJsonAsync<Page<Muscle>>("api/v2/muscle/?limit=100", ct))!.Results;

    public async Task<IReadOnlyList<ExerciseInfo>> GetExercisesAsync(
        int? categoryId, int? equipmentId, int? muscleId, int limit, CancellationToken ct)
    {
        var query = new List<string> { $"language={EnglishLanguageId}", $"limit={limit}" };
        if (categoryId is not null) query.Add($"category={categoryId}");
        if (equipmentId is not null) query.Add($"equipment={equipmentId}");
        if (muscleId is not null) query.Add($"muscles={muscleId}");
        var page = await http.GetFromJsonAsync<Page<ExerciseInfo>>($"api/v2/exerciseinfo/?{string.Join('&', query)}", ct);
        return page!.Results;
    }

    public Task<ExerciseInfo?> GetExerciseAsync(int id, CancellationToken ct) =>
        http.GetFromJsonAsync<ExerciseInfo>($"api/v2/exerciseinfo/{id}/", ct);

    public static Translation? English(ExerciseInfo e) =>
        e.Translations.FirstOrDefault(t => t.Language == EnglishLanguageId);

    public static string PublicUrl(int id) => $"https://wger.de/en/exercise/{id}/view-base";

    public static string StripHtml(string html) =>
        WhitespaceRegex().Replace(TagRegex().Replace(html, " "), " ").Trim();

    [GeneratedRegex("<[^>]+>")] private static partial Regex TagRegex();
    [GeneratedRegex(@"\s+")] private static partial Regex WhitespaceRegex();
}

public sealed record Page<T>([property: JsonPropertyName("count")] int Count,
                             [property: JsonPropertyName("results")] List<T> Results);

public sealed record NamedRef([property: JsonPropertyName("id")] int Id,
                              [property: JsonPropertyName("name")] string Name);

public sealed record Muscle([property: JsonPropertyName("id")] int Id,
                            [property: JsonPropertyName("name")] string Name,
                            [property: JsonPropertyName("name_en")] string? NameEn);

public sealed record Translation([property: JsonPropertyName("language")] int Language,
                                 [property: JsonPropertyName("name")] string Name,
                                 [property: JsonPropertyName("description")] string Description);

public sealed record ExerciseInfo(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("category")] NamedRef Category,
    [property: JsonPropertyName("muscles")] List<Muscle> Muscles,
    [property: JsonPropertyName("muscles_secondary")] List<Muscle> MusclesSecondary,
    [property: JsonPropertyName("equipment")] List<NamedRef> Equipment,
    [property: JsonPropertyName("translations")] List<Translation> Translations);
