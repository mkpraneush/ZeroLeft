import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Camera, Upload, MapPin, Clock, Tag, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Navbar from '../components/Navbar';
import type { Product } from '../types';
import './AddProductPage.css';

const schema = z.object({
  product_name: z.string().min(2, 'Product name required'),
  category: z.enum(['vegetables', 'fruits', 'flowers', 'other']),
  initial_quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().min(1, 'Unit required'),
  price_per_unit: z.number().positive('Price must be positive'),
  discount_percent: z.number().min(0).max(100),
  session_start: z.string().min(1, 'Start time required'),
  session_end: z.string().min(1, 'End time required'),
  description: z.string().optional(),
}).refine(
  (d) => new Date(d.session_end) > new Date(d.session_start),
  { message: 'End time must be after start time', path: ['session_end'] }
);

type FormValues = z.infer<typeof schema>;

const UNITS = ['kg', 'g', 'bunch', 'piece', 'dozen', 'litre', 'box', 'bag'];
const CATEGORIES = [
  { value: 'vegetables', label: '🥬 Vegetables', color: 'green' },
  { value: 'fruits',     label: '🍊 Fruits',     color: 'orange' },
  { value: 'flowers',    label: '🌸 Flowers',    color: 'pink' },
  { value: 'other',      label: '🛍️ Other',      color: 'gray' },
];

export default function AddProductPage() {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const vendorProfileQuery = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => api.get('/vendor/profile').then((response) => response.data),
  });
  const hasShopLocation = Boolean(vendorProfileQuery.data?.location?.coordinates?.length === 2);
  const productQuery = useQuery<Product>({
    queryKey: ['product', productId],
    enabled: Boolean(productId),
    queryFn: () => api.get(`/products/${productId}`).then((response) => response.data),
  });
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      category: 'vegetables',
      unit: 'kg',
      discount_percent: 0,
      session_start: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      session_end: new Date(Date.now() + 2 * 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    },
  });

  useEffect(() => {
    const product = productQuery.data;
    if (!product) return;
    const toLocalInput = (value: string) => {
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };
    reset({
      product_name: product.product_name,
      category: product.category,
      initial_quantity: product.initial_quantity,
      unit: product.unit,
      price_per_unit: product.original_price_per_unit,
      discount_percent: product.discount_percent,
      session_start: toLocalInput(product.session_start),
      session_end: toLocalInput(product.session_end),
      description: product.description || '',
    });
    setImageUrl(product.image_url || '');
    setImagePreview(product.image_url || '');
  }, [productQuery.data, reset]);

  const selectedCategory = watch('category');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      toast.error('Choose an image file no larger than 10 MB.');
      e.target.value = '';
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/vendor/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(res.data.image_url);
      toast.success('Image uploaded!');
    } catch {
      toast.error('Image upload failed. Configure image storage or try another image.');
      setImageUrl('');
    } finally {
      setUploading(false);
    }
  };

  const mutation = useMutation({
    mutationFn: (data: FormValues & { image_url?: string }) => {
      const payload = {
        ...data,
        discount_percent: data.discount_percent || 0,
        image_url: productId ? imageUrl : imageUrl || undefined,
        session_start: new Date(data.session_start).toISOString(),
        session_end: new Date(data.session_end).toISOString(),
      };
      return productId
        ? api.put(`/products/${productId}`, payload)
        : api.post('/products/', payload);
    },
    onSuccess: () => {
      toast.success(productId ? 'Offer updated.' : 'Offer published. Matching-customer email status is available in your dashboard.');
      navigate('/vendor/dashboard');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to publish offer');
    },
  });

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">
        <div className="container add-product-container">
          <div className="add-product-header animate-fade-in">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
            <h1 className="section-title" style={{ marginBottom: 4 }}>{productId ? 'Edit Product Offer' : 'Add New Product Offer'}</h1>
            <p className="section-subtitle">{productId ? 'Update your offer details.' : 'Fill in the details below to publish your offer.'}</p>
            {vendorProfileQuery.isError && <div className="alert alert-warning">Could not load your shop profile.</div>}
            {productQuery.isLoading && <div className="alert alert-info">Loading current offer…</div>}
            {productQuery.isError && <div className="alert alert-warning">Could not load this offer.</div>}
            {!vendorProfileQuery.isLoading && vendorProfileQuery.data && !hasShopLocation && (
              <div className="alert alert-warning">
                Save your shop coordinates before publishing. <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/vendor/profile')}>Set shop location</button>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit((d) => mutation.mutate(d))}
            noValidate
            className="add-product-form animate-slide-up"
          >
            {/* Image Upload */}
            <div className="card card-body image-upload-section">
              <h2 className="form-section-title"><Camera size={18} /> Product Photo</h2>
              <div
                className={`image-drop-zone ${imagePreview ? 'has-image' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload product image"
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" className="image-preview" />
                ) : (
                  <div className="image-drop-placeholder">
                    {uploading ? (
                      <><div className="spinner" /><span>Uploading…</span></>
                    ) : (
                      <><Upload size={32} /><span>Click to upload from gallery or camera</span><span className="upload-hint">JPG, PNG up to 10MB</span></>
                    )}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="sr-only"
              />
              {imagePreview && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => { setImagePreview(''); setImageUrl(''); }}
                >
                  Remove photo
                </button>
              )}
            </div>

            {/* Category */}
            <div className="card card-body">
              <h2 className="form-section-title"><Tag size={18} /> Category</h2>
              <div className="category-grid">
                {CATEGORIES.map((cat) => (
                  <label key={cat.value} className={`category-chip ${selectedCategory === cat.value ? 'active' : ''}`}>
                    <input
                      type="radio"
                      value={cat.value}
                      {...register('category')}
                      className="sr-only"
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Product Details */}
            <div className="card card-body">
              <h2 className="form-section-title"><Package size={18} /> Product Details</h2>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="product-name">Product Name *</label>
                  <input
                    id="product-name"
                    className={`form-input ${errors.product_name ? 'error' : ''}`}
                    placeholder="e.g., Cherry Tomatoes, Alphonso Mangoes"
                    {...register('product_name')}
                  />
                  {errors.product_name && <span className="form-error">{errors.product_name.message}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="description">Description</label>
                  <input
                    id="description"
                    className="form-input"
                    placeholder="Optional details about quality, variety…"
                    {...register('description')}
                  />
                </div>
              </div>

              {!productId ? (
                <div className="form-row three-col">
                  <div className="form-group">
                    <label className="form-label" htmlFor="qty">Initial Quantity *</label>
                    <input id="qty" type="number" step="0.1" min="0.1" className={`form-input ${errors.initial_quantity ? 'error' : ''}`} placeholder="24" {...register('initial_quantity', { valueAsNumber: true })} />
                    {errors.initial_quantity && <span className="form-error">{errors.initial_quantity.message}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="unit">Unit *</label>
                    <select id="unit" className="form-input form-select" {...register('unit')}>
                      {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="price">Original Price per Unit (₹) *</label>
                    <input id="price" type="number" step="0.5" min="1" className={`form-input ${errors.price_per_unit ? 'error' : ''}`} placeholder="60" {...register('price_per_unit', { valueAsNumber: true })} />
                    {errors.price_per_unit && <span className="form-error">{errors.price_per_unit.message}</span>}
                  </div>
                </div>
              ) : (
                <div className="form-row">
                  <p className="section-subtitle">Unit: {productQuery.data?.unit || 'Loading…'}. Inventory: {productQuery.data?.available_quantity ?? '—'} available, {productQuery.data?.reserved_quantity ?? '—'} reserved.</p>
                  <div className="form-group">
                    <label className="form-label" htmlFor="price">Original Price per Unit (₹) *</label>
                    <input id="price" type="number" step="0.5" min="1" className={`form-input ${errors.price_per_unit ? 'error' : ''}`} {...register('price_per_unit', { valueAsNumber: true })} />
                    {errors.price_per_unit && <span className="form-error">{errors.price_per_unit.message}</span>}
                  </div>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="discount">Discount (%)</label>
                  <input id="discount" type="number" step="1" min="0" max="100" className={`form-input ${errors.discount_percent ? 'error' : ''}`} {...register('discount_percent', { valueAsNumber: true })} />
                  {errors.discount_percent && <span className="form-error">{errors.discount_percent.message}</span>}
                </div>
              </div>
            </div>

            {/* Session Times */}
            <div className="card card-body">
              <h2 className="form-section-title"><Clock size={18} /> Start session and end session</h2>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                Customers can place orders only between start session and end session. When end session is reached, the offer expires and new orders are blocked.
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="session-start">Start session *</label>
                  <input
                    id="session-start"
                    type="datetime-local"
                    className={`form-input ${errors.session_start ? 'error' : ''}`}
                    {...register('session_start')}
                  />
                  {errors.session_start && <span className="form-error">{errors.session_start.message}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="session-end">End session *</label>
                  <input
                    id="session-end"
                    type="datetime-local"
                    className={`form-input ${errors.session_end ? 'error' : ''}`}
                    {...register('session_end')}
                  />
                  {errors.session_end && <span className="form-error">{errors.session_end.message}</span>}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="add-product-actions">
              <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button
                type="submit"
                id="publish-offer-btn"
                className="btn btn-primary btn-lg"
                disabled={mutation.isPending || uploading || vendorProfileQuery.isLoading || !hasShopLocation || Boolean(productId && (productQuery.isLoading || productQuery.isError))}
              >
                {mutation.isPending ? (
                  <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Publishing…</>
                ) : (
                  productId ? 'Save Offer' : '🚀 Publish Offer'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
