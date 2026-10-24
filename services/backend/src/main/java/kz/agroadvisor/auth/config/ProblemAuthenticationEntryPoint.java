package kz.agroadvisor.auth.config;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.common.web.ProblemResponses;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/** 401 as Problem Details. The reason (missing, malformed, expired token) is not revealed. */
@Component
class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException exception) throws IOException {
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        ProblemResponses.write(request, response, HttpStatus.UNAUTHORIZED,
                ErrorCodes.UNAUTHORIZED, "Authentication required");
    }
}
