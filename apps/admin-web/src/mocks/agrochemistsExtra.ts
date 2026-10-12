import type { Agrochemist, DocumentKind } from '@/shared/types'

const UNIVERSITIES = [
  'Казахский национальный аграрный исследовательский университет',
  'Казахский агротехнический исследовательский университет им. С. Сейфуллина',
  'Южно-Казахстанский университет им. М. Ауэзова',
  'Костанайский региональный университет им. А. Байтурсынова',
]

/**
 * Additional reviewed applications: the pending ones stay the four from the mockup.
 * Format: id; name; specialization; region; years; rating; a(pproved)/r(ejected);
 * submitted (ISO date); university index; diploma year; d (diploma) / dc (diploma + certificate);
 * rejection reason.
 */
const ROWS = `
a-x01;Светлана Ким;Овощеводство;Алматинская;14;4,9;a;2026-01-22;0;2011;dc;
a-x02;Ержан Досжанов;Зерновые культуры;Акмолинская;11;4,7;a;2026-02-14;1;2013;d;
a-x03;Динара Абдуллаева;Защита растений;Туркестанская;7;4,6;a;2026-03-05;2;2018;dc;
a-x04;Айгерим Касенова;Агрохимия почв;Жамбылская;9;4,8;a;2026-03-19;0;2016;d;
a-x05;Марат Жунусов;Фитопатология;Алматинская;16;4,9;a;2026-04-02;0;2009;dc;
a-x06;Ольга Петренко;Зерновые культуры;Костанайская;12;4,5;a;2026-04-20;3;2012;d;
a-x07;Бахыт Айтжанов;Плодоовощеводство;Туркестанская;8;4,4;a;2026-05-06;2;2017;d;
a-x08;Гульнара Исмаилова;Защита растений;Алматинская;6;4,7;a;2026-05-28;0;2019;dc;
a-x09;Тимур Ахметжанов;Агрономия;Северо-Казахстанская;10;4,6;a;2026-06-15;1;2015;d;
a-x10;Камила Нурпеисова;Фитопатология;Жамбылская;5;4,8;a;2026-07-03;0;2020;dc;
a-x11;Арман Жакупов;Агрохимия почв;Павлодарская;13;4,5;a;2026-07-24;1;2012;d;
a-x12;Аружан Сеитова;Овощеводство;Алматинская;4;4,7;a;2026-08-18;0;2021;dc;
a-x13;Нурсултан Бекенов;Зерновые культуры;Акмолинская;7;4,6;a;2026-09-09;1;2018;d;
a-x14;Ринат Галиев;Защита растений;Карагандинская;2;;r;2026-10-06;0;2024;c;Сертификат не подтверждает профильное образование
`

const document = (
  kind: DocumentKind,
  id: string,
  university: string,
  year: number,
): Agrochemist['documents'][number] => ({
  kind,
  title: kind === 'diploma' ? 'Диплом, «Агрономия»' : 'Сертификат повышения квалификации',
  issuer: kind === 'diploma' ? university : 'КазНИИ защиты и карантина растений',
  year: kind === 'diploma' ? year : year + 3,
  fileUrl: `/mock-documents/${id}-${kind}.pdf`,
})

export const extraAgrochemists: Agrochemist[] = ROWS.trim()
  .split('\n')
  .map((row) => {
    const [
      id,
      name,
      specialization,
      region,
      years,
      rating,
      status,
      submitted,
      uni,
      year,
      docs,
      reason,
    ] = row.split(';')
    const university = UNIVERSITIES[Number(uni)]
    const submittedAt = `${submitted}T09:00:00.000Z`
    const reviewed = new Date(submittedAt)
    reviewed.setDate(reviewed.getDate() + 1)
    return {
      id,
      name,
      specialization,
      region,
      experienceYears: Number(years),
      rating: rating ? Number(rating.replace(',', '.')) : undefined,
      documents:
        docs === 'c'
          ? [document('certificate', id, university, Number(year))]
          : [
              document('diploma', id, university, Number(year)),
              ...(docs === 'dc' ? [document('certificate', id, university, Number(year))] : []),
            ],
      status: status === 'r' ? 'rejected' : 'approved',
      submittedAt,
      reviewedAt: reviewed.toISOString(),
      rejectionReason: reason || undefined,
    }
  })
