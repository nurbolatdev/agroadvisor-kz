/**
 * Feature access checks. Business code asks whether a user may use a feature
 * instead of checking roles directly, so paid features can be added later.
 *
 * <p>Layout: {@code web} (controllers, DTOs), {@code service}, {@code repository},
 * {@code model}. Other modules use only this module's {@code service} package.
 */
package kz.agroadvisor.access;
