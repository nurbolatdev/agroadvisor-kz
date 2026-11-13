package kz.agroadvisor.consultations.model;

/** Where a consultation is: requested, then active, then closed; or requested and declined. */
public enum ConsultationStatus {

    REQUESTED("requested"),
    ACTIVE("active"),
    DECLINED("declined"),
    CLOSED("closed");

    private final String code;

    ConsultationStatus(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    public static ConsultationStatus fromCode(String code) {
        for (ConsultationStatus status : values()) {
            if (status.code.equals(code)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown consultation status: " + code);
    }
}
