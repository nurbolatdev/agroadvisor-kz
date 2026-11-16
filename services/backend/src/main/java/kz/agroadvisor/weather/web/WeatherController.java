package kz.agroadvisor.weather.web;

import java.math.BigDecimal;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import kz.agroadvisor.weather.service.WeatherService;
import kz.agroadvisor.weather.service.WeatherService.WeatherView;

/** The weather and the spraying hints for a point, for the signed-in farmer. */
@RestController
@RequestMapping("/api/weather")
@PreAuthorize("hasRole('FARMER') and @featureAccess.allows(authentication, 'weather')")
public class WeatherController {

    private final WeatherService weather;

    public WeatherController(WeatherService weather) {
        this.weather = weather;
    }

    /**
     * Now, the hours up to the end of the fifth day and the spray windows. The client sends the point of a
     * field or of the phone; the server keeps no point of its own.
     */
    @GetMapping
    @Operation(operationId = "getWeather")
    public WeatherView get(
            @Parameter(description = "Degrees north, -90 to 90", example = "43.25") @RequestParam BigDecimal latitude,
            @Parameter(description = "Degrees east, -180 to 180", example = "76.95") @RequestParam BigDecimal longitude,
            Authentication authentication) {
        return weather.weather(UUID.fromString(authentication.getName()), latitude, longitude);
    }
}
