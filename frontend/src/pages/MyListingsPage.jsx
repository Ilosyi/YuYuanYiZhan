
// frontend/src/pages/MyListingsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api, { resolveAssetUrl } from '../api';
import MyListingCard from '../components/MyListingCard';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { FALLBACK_IMAGE } from '../constants/defaultImages';

const STATUS_LABELS = {
	all: '全部状态',
	available: '上架中',
	in_progress: '交易中',
	completed: '已完成'
};

const TYPE_LABELS = {
	all: '全部分类',
	sale: '出售',
	acquire: '收购',
	errand: '跑腿代办',
	help: '帮帮忙',
	lostfound: '失物招领'
};

const MyListingsPage = ({ currentUser, onEditListing }) => {
	const [myListings, setMyListings] = useState([]);
	const [filterStatus, setFilterStatus] = useState('all');
	const [filterType, setFilterType] = useState('all');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [isDetailOpen, setIsDetailOpen] = useState(false);
	const [detailListing, setDetailListing] = useState(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState(null);
	const [confirmingId, setConfirmingId] = useState(null);

	const confirm = useConfirm();
	const toast = useToast();

	const fetchMyListings = useCallback(async () => {
		if (!currentUser) return;
		setIsLoading(true);
		setError(null);
		try {
			const { data } = await api.get('/api/listings', {
				params: {
					userId: currentUser.id,
					status: filterStatus !== 'all' ? filterStatus : undefined,
					type: filterType !== 'all' ? filterType : undefined
				}
			});
			setMyListings(data);
		} catch (err) {
			console.error(err);
			setError(err.response?.data?.message || '加载我的发布失败，请稍后重试。');
		} finally {
			setIsLoading(false);
		}
	}, [currentUser, filterStatus, filterType]);

	useEffect(() => {
		fetchMyListings();
	}, [fetchMyListings]);

	const handleDelete = useCallback(async (listingId) => {
		if (!listingId) return;
		let ok = true;
		try {
			ok = await confirm({
				title: '删除发布',
				message: '确定要删除这个发布吗？此操作不可恢复。',
				tone: 'danger',
				confirmText: '删除',
				cancelText: '取消'
			});
		} catch (err) {
			console.warn('确认弹窗失败，退回原生 confirm', err);
			ok = window.confirm('确定要删除这个发布吗？');
		}
		if (!ok) return;

		try {
			await api.delete(`/api/listings/${listingId}`);
			toast.success('删除成功！');
			fetchMyListings();
		} catch (err) {
			console.error(err);
			toast.error(err.response?.data?.message || '删除失败，请稍后再试。');
		}
	}, [confirm, fetchMyListings, toast]);

	const openDetail = useCallback(async (listing) => {
		if (!listing) return;
		setIsDetailOpen(true);
		setDetailListing(null);
		setDetailError(null);
		setDetailLoading(true);
		try {
			const { data } = await api.get(`/api/listings/${listing.id}/detail`);
			setDetailListing(data.listing);
		} catch (err) {
			console.error(err);
			setDetailError(err.response?.data?.message || '加载详情失败，请稍后重试。');
		} finally {
			setDetailLoading(false);
		}
	}, []);

	const closeDetail = useCallback(() => {
		setIsDetailOpen(false);
		setDetailListing(null);
		setDetailError(null);
	}, []);

	const refreshDetail = useCallback(async (listingId) => {
		if (!listingId || !isDetailOpen) return;
		try {
			const { data } = await api.get(`/api/listings/${listingId}/detail`);
			setDetailListing(data.listing);
		} catch (err) {
			console.error(err);
			setDetailError(err.response?.data?.message || '刷新详情失败，请稍后再试。');
		}
	}, [isDetailOpen]);

	const handleConfirmErrand = useCallback(async (listing) => {
		if (!listing) return;
		if (!listing.errand_completion_image_url) {
			toast.warning('接单者尚未上传完成凭证，暂无法确认。');
			return;
		}

		let ok = true;
		try {
			ok = await confirm({
				title: '确认完成',
				message: '确定已经核实跑腿任务已完成并发放酬劳？',
				tone: 'success',
				confirmText: '确认完成',
				cancelText: '暂不确认'
			});
		} catch (err) {
			console.warn('确认弹窗失败，退回原生 confirm', err);
			ok = window.confirm('确定已经核实跑腿任务已完成？');
		}
		if (!ok) return;

		setConfirmingId(listing.id);
		try {
			await api.post(`/api/errands/${listing.id}/confirm`);
			toast.success('已确认完成，酬劳已发放。');
			await fetchMyListings();
			await refreshDetail(listing.id);
		} catch (err) {
			console.error(err);
			toast.error(err.response?.data?.message || '确认失败，请稍后再试。');
		} finally {
			setConfirmingId(null);
		}
	}, [confirm, fetchMyListings, refreshDetail, toast]);

	return (
		<>
			<div className="min-h-full bg-gradient-to-b from-gray-50 to-white">
				<div className="mb-6 bg-white rounded-xl shadow p-5 flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
							<span role="img" aria-label="folder">🗂️</span>
							我的发布
						</h2>
						<p className="mt-1 text-sm text-gray-500">管理你发布的出售、收购与信息贴，支持筛选与快速编辑。</p>
					</div>
					<button
						type="button"
						onClick={() => onEditListing(null)}
						className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow"
					>
						发布新内容
					</button>
				</div>

				<div className="flex flex-wrap gap-2 mb-4">
					<span className="self-center text-sm font-medium text-gray-600">类型:</span>
					{Object.entries(TYPE_LABELS).map(([key, value]) => (
						<button
							key={key}
							type="button"
							onClick={() => setFilterType(key)}
							className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterType === key ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
						>
							{value}
						</button>
					))}
				</div>

				<div className="flex flex-wrap gap-2 mb-6">
					<span className="self-center text-sm font-medium text-gray-600">状态:</span>
					{Object.entries(STATUS_LABELS).map(([key, value]) => (
						<button
							key={key}
							type="button"
							onClick={() => setFilterStatus(key)}
							className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === key ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
						>
							{value}
						</button>
					))}
				</div>

				{isLoading ? (
					<p>加载中...</p>
				) : error ? (
					<p className="text-red-500">{error}</p>
				) : myListings.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
						{myListings.map((item) => {
							const isErrand = item.type === 'errand';
							const hasRunner = Boolean(item.errand_runner_id);
							const hasProof = Boolean(item.errand_completion_image_url);
							const isCompleted = item.status === 'completed';

							const confirmDisabled = !isErrand || !hasRunner || !hasProof || isCompleted || confirmingId === item.id;
							const canEdit = !(isErrand && hasRunner);
							const canDelete = !(isErrand && hasRunner);

							const extraActions = [];
							if (isErrand && hasRunner) {
								extraActions.push({
									key: 'confirm',
									label: confirmingId === item.id ? '确认中...' : '确认完成',
									onClick: () => handleConfirmErrand(item),
									disabled: confirmDisabled,
									variant: 'success'
								});
							}

							return (
								<MyListingCard
									key={item.id}
									item={item}
									onEdit={() => onEditListing(item)}
									onDelete={() => handleDelete(item.id)}
									onView={() => openDetail(item)}
									extraActions={extraActions}
									canEdit={canEdit}
									canDelete={canDelete}
								/>
							);
						})}
					</div>
				) : (
					<div className="text-center text-gray-500 mt-10">
						<div className="text-5xl mb-3" role="img" aria-label="empty inbox">📭</div>
						<p>你还没有发布任何内容。</p>
					</div>
				)}
			</div>

			{isDetailOpen && (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
					<div className="bg-white rounded-xl shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
						<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
							<h3 className="text-xl font-semibold text-gray-900">发布详情</h3>
							<button onClick={closeDetail} className="text-gray-500 hover:text-gray-700" type="button">✕</button>
						</div>
						<div className="px-6 py-4 space-y-4">
							{detailLoading && <p className="text-center text-gray-500 py-10">加载中...</p>}
							{detailError && <p className="text-center text-red-500 py-10">{detailError}</p>}
							{!detailLoading && !detailError && detailListing && (
								<>
									<div className="space-y-2">
										<h4 className="text-lg font-semibold text-gray-800">{detailListing.title}</h4>
										<p className="text-sm text-gray-500">状态：{STATUS_LABELS[detailListing.status] || detailListing.status}</p>
										<p className="text-sm text-gray-500">类型：{TYPE_LABELS[detailListing.type] || detailListing.type}</p>
										<p className="text-sm text-gray-500">发布时间：{new Date(detailListing.created_at).toLocaleString()}</p>
										{Number(detailListing.price) > 0 && (
											<p className="text-xl font-semibold text-indigo-600">¥{Number(detailListing.price).toLocaleString()}</p>
										)}
										<p className="text-gray-700 whitespace-pre-line leading-relaxed">{detailListing.description}</p>
									</div>

									{Array.isArray(detailListing.images) && detailListing.images.length > 0 && (
										<div>
											<h5 className="text-sm font-medium text-gray-600 mb-2">已上传图片</h5>
											<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
												{detailListing.images.map((img) => {
													const url = resolveAssetUrl(img.image_url);
													return (
														<img
															key={img.id}
															src={url}
															alt={`${detailListing.title}-${img.id}`}
															className="w-full h-32 object-cover rounded-md border border-gray-100"
															onClick={() => url && window.open(url, '_blank', 'noopener')}
														/>
													);
												})}
											</div>
										</div>
									)}

									{detailListing.type === 'errand' && (
										<div className="space-y-3">
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
												{detailListing.start_location && <span>出发地点：{detailListing.start_location}</span>}
												{detailListing.end_location && <span>目的地点：{detailListing.end_location}</span>}
												{detailListing.errand_runner_name && <span>接单人：{detailListing.errand_runner_name}</span>}
												{detailListing.errand_accept_at && <span>接单时间：{new Date(detailListing.errand_accept_at).toLocaleString()}</span>}
												{detailListing.errand_payment_released_at && <span>确认时间：{new Date(detailListing.errand_payment_released_at).toLocaleString()}</span>}
											</div>
											{detailListing.errand_private_note && (
												<div className="bg-rose-50 border border-rose-100 rounded-md p-3 text-sm text-rose-700">
													<div className="font-medium">隐私备注</div>
													<p className="mt-1 whitespace-pre-line">{detailListing.errand_private_note}</p>
												</div>
											)}
											{detailListing.errand_completion_image_url && (
												<div className="space-y-2">
													<h5 className="text-sm font-medium text-gray-600">接单人提交的完成凭证</h5>
													<img
														src={resolveAssetUrl(detailListing.errand_completion_image_url) || FALLBACK_IMAGE}
														alt="完成凭证"
														className="w-full max-w-md rounded-md border border-gray-200 object-contain bg-gray-50"
														onClick={() => {
															const url = resolveAssetUrl(detailListing.errand_completion_image_url);
															if (url) window.open(url, '_blank', 'noopener');
														}}
													/>
													{detailListing.errand_completion_note && (
														<p className="text-sm text-gray-600">备注：{detailListing.errand_completion_note}</p>
													)}
												</div>
											)}
											<div className="flex flex-wrap gap-3">
												<button
													type="button"
													onClick={() => handleConfirmErrand(detailListing)}
													disabled={
														confirmingId === detailListing.id ||
														!detailListing.errand_runner_id ||
														!detailListing.errand_completion_image_url ||
														detailListing.status === 'completed'
													}
													className={`px-4 py-2 text-sm rounded-md ${
														confirmingId === detailListing.id ||
														!detailListing.errand_runner_id ||
														!detailListing.errand_completion_image_url ||
														detailListing.status === 'completed'
															? 'bg-gray-200 text-gray-500 cursor-not-allowed'
															: 'bg-emerald-600 text-white hover:bg-emerald-500'
													}`}
												>
													{confirmingId === detailListing.id ? '确认中...' : '确认完成并发放酬劳'}
												</button>
											</div>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default MyListingsPage;

