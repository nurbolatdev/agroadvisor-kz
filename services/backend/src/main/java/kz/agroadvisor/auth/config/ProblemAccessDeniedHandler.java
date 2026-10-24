package kz.agroadvisor.auth.config;

import java.io.IOException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import kz.agroadvisor.common.web.ErrorCodes;
import kz.agroadvisor.common.web.ProblemResponses;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/** 403 as Problem Details. */
@Component
class ProblemAccessDeniedHandler implements AccessDeniedHandler {

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException exception) throws IOException {
        ProblemResponses.write(request, response, HttpStatus.FORBIDDEN,
                ErrorCodes.FORBIDDEN, "Access denied");
    }
}
