import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../../components/common/PageHeader';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import DateInput from '../../../components/ui/DateInput';
import EmptyState from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import Icon from '../../../components/ui/Icon';
import Input from '../../../components/ui/Input';
import Pagination from '../../../components/ui/Pagination';
import Select from '../../../components/ui/Select';
import Skeleton from '../../../components/ui/Skeleton';
import { useToast } from '../../../components/ui/ToastProvider';
import useApi from '../../../hooks/useApi';
import useDebounce from '../../../hooks/useDebounce';
import usePagination from '../../../hooks/usePagination';
import { coursesApi } from '../../../services/coursesApi';
import { studentApi } from '../../../services/studentApi';
import { formatNumber, formatPercent } from '../../../utils/format';
import {
  COURSE_CATEGORY_LABELS,
  PRIORITY_OPTIONS,
  labelFor,
  statusTone,
} from '../../../utils/constants';
import './courses.css';

const SORT_OPTIONS = [
  { value: 'title', label: 'Title A–Z' },
  { value: '-title', label: 'Title Z–A' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/** Browse the published catalogue — `GET /api/v1/courses` with search + paging. */
export default function BrowseCoursesPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const pager = usePagination({
    initialSearch: searchParams.get('q') || '',
    initialSort: 'title',
  });
  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') || '');
  const debouncedSearch = useDebounce(searchDraft, 300);
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [categories, setCategories] = useState([]);
  const [enrolling, setEnrolling] = useState(null);
  const [enrollForm, setEnrollForm] = useState({
    target_completion_date: '',
    priority: 'medium',
  });
  const [enrollBusy, setEnrollBusy] = useState(false);

  const { page, perPage, sort } = pager;

  useEffect(() => {
    pager.setSearch(debouncedSearch);
    const next = new URLSearchParams(searchParams);
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const fetchCourses = useCallback(
    () =>
      coursesApi.list({
        page,
        per_page: perPage,
        q: pager.search,
        sort,
        category,
      }),
    [page, perPage, pager.search, sort, category],
  );
  const { data, error, loading, reload } = useApi(fetchCourses, {
    onSuccess: (payload) => pager.applyMeta(payload),
  });

  useEffect(() => {
    coursesApi
      .categories()
      .then((payload) =>
        setCategories(
          (payload.categories || []).map((item) => ({
            value: item.value,
            label: `${labelFor(COURSE_CATEGORY_LABELS, item.value)} (${item.count})`,
          })),
        ),
      )
      .catch(() => setCategories([]));
  }, []);

  async function confirmEnroll() {
    if (!enrolling) return;
    setEnrollBusy(true);
    try {
      await studentApi.enroll({
        course_id: enrolling.id,
        target_completion_date: enrollForm.target_completion_date || null,
        priority: enrollForm.priority,
      });
      toast.success('Enrolled', `${enrolling.title} was added to your study list.`);
      setEnrolling(null);
      reload();
    } catch (caught) {
      toast.apiError(caught, 'Could not enroll');
    } finally {
      setEnrollBusy(false);
    }
  }

  const items = data?.items || [];

  return (
    <div className="sp-page">
      <PageHeader
        title="Browse courses"
        description="Published courses and examinations. Search by title, category or target audience."
        actions={
          <Button to="/app/courses" iconLeft="courses">
            My courses
          </Button>
        }
      />

      <Card>
        <div className="sp-courses__filters">
          <Input
            label="Search"
            type="search"
            iconLeft="search"
            value={searchDraft}
            placeholder="UPSC, JEE, Physics…"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Select
            label="Category"
            placeholder="All categories"
            options={categories}
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              pager.setPage(1);
            }}
          />
          <Select
            label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(event) => pager.setSort(event.target.value)}
          />
        </div>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={reload} boxed />
      ) : loading ? (
        <div className="sp-courses__grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="sp-coursecard" key={index}>
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" count={3} />
              <Skeleton variant="text" width="40%" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title="No courses match your search"
            description="Try a different term or clear the category filter."
            action={
              <Button
                size="sm"
                onClick={() => {
                  setSearchDraft('');
                  setCategory('');
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="sp-courses__grid">
            {items.map((course) => (
              <article className="sp-coursecard" key={course.id}>
                <div className="sp-coursecard__head">
                  <Link className="sp-coursecard__title" to={`/app/courses/${course.id}`}>
                    {course.title}
                  </Link>
                  <Badge tone={statusTone(course.category)} size="sm">
                    {labelFor(COURSE_CATEGORY_LABELS, course.category)}
                  </Badge>
                </div>
                {course.description ? (
                  <p className="sp-coursecard__desc">{course.description}</p>
                ) : null}
                <div className="sp-coursecard__facts">
                  <span className="sp-coursecard__fact">
                    <Icon name="layers" size={13} />
                    {formatNumber(course.subject_count)} subjects
                  </span>
                  <span className="sp-coursecard__fact">
                    <Icon name="syllabus" size={13} />
                    {formatNumber(course.topic_count)} topics
                  </span>
                  {course.estimated_duration_weeks ? (
                    <span className="sp-coursecard__fact">
                      <Icon name="calendar" size={13} />
                      {course.estimated_duration_weeks} weeks
                    </span>
                  ) : null}
                  {course.level ? (
                    <span className="sp-coursecard__fact">
                      <Icon name="shield" size={13} />
                      {course.level}
                    </span>
                  ) : null}
                </div>
                <div className="sp-coursecard__foot">
                  {course.is_enrolled ? (
                    <>
                      <Badge tone="success" size="sm">
                        Enrolled{' '}
                        {course.progress_percent !== null &&
                        course.progress_percent !== undefined
                          ? `· ${formatPercent(course.progress_percent)}`
                          : ''}
                      </Badge>
                      <Button
                        size="sm"
                        variant="primary"
                        to={`/app/syllabus/${course.id}`}
                      >
                        Open syllabus
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        iconLeft="plus"
                        onClick={() => {
                          setEnrolling(course);
                          setEnrollForm({
                            target_completion_date: '',
                            priority: 'medium',
                          });
                        }}
                      >
                        Enroll
                      </Button>
                      <Button size="sm" variant="ghost" to={`/app/courses/${course.id}`}>
                        Details
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <Card>
            <Pagination
              page={pager.meta.page}
              pages={pager.meta.pages}
              total={pager.meta.total}
              perPage={pager.meta.per_page}
              onPageChange={pager.setPage}
              label="courses"
            />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(enrolling)}
        tone="primary"
        title="Enroll in this course?"
        message={
          enrolling
            ? `"${enrolling.title}" will be added to your study list with its full syllabus.`
            : ''
        }
        details={
          <div className="sp-stack">
            <DateInput
              label="Target completion date"
              value={enrollForm.target_completion_date}
              onChange={(event) =>
                setEnrollForm((current) => ({
                  ...current,
                  target_completion_date: event.target.value,
                }))
              }
              hint="Optional — used as the deadline when planning"
            />
            <Select
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={enrollForm.priority}
              onChange={(event) =>
                setEnrollForm((current) => ({
                  ...current,
                  priority: event.target.value,
                }))
              }
            />
          </div>
        }
        confirmLabel="Enroll"
        loading={enrollBusy}
        onConfirm={confirmEnroll}
        onClose={() => setEnrolling(null)}
      />
    </div>
  );
}
